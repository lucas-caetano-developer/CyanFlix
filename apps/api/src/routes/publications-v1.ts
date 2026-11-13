import type { FastifyInstance, FastifyReply } from "fastify";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { prisma } from "@cyanflix/database";
import { isSafeRelativePath, manifestHash, manifestSchema, type PackageManifest } from "@cyanflix/contracts";
import { env, activeUploads } from "../lib/config.js";
import { safeDataPath, ensureUploadDirectory } from "../lib/storage.js";
import { manifestAssetMap } from "../lib/catalog-helpers.js";
import { deletePublicationCompletely, PublicationDeletionConflict } from "../services/deletion.js";
import { toJson } from "../lib/mappers.js";

class UploadConflict extends Error {}

export async function publicationV1Routes(app: FastifyInstance) {
app.get("/v1/publications/:uploadId", async (request, reply) => {
  const publication = await prisma.publication.findUnique({
    where: { uploadId: (request.params as { uploadId: string }).uploadId },
  });
  return publication
    ? publicationStatus(publication.id, reply)
    : reply.code(404).send({ error: "Publicação não encontrada" });
});
app.delete("/v1/publications/:uploadId", async (request, reply) => {
  const uploadId = (request.params as { uploadId: string }).uploadId;
  const publication = await prisma.publication.findUnique({
    where: { uploadId },
    select: { id: true, packageId: true, manifestSha256: true, state: true },
  });
  if (!publication)
    return reply.code(404).send({ error: "Publicação não encontrada" });
  const packageId = request.headers["x-package-id"]?.toString() ?? "";
  const manifestSha256 =
    request.headers["x-manifest-sha256"]?.toString().toLowerCase() ?? "";
  if (
    packageId !== publication.packageId ||
    manifestSha256 !== publication.manifestSha256
  ) {
    return reply.code(409).send({ error: "Confirmação do pacote não confere" });
  }
  if (publication.state === "confirmed") {
    return reply.code(409).send({
      error:
        "Publicação confirmada só pode ser excluída pelo painel administrativo",
    });
  }
  try {
    await deletePublicationCompletely(publication.id, packageId);
    return reply.code(204).send();
  } catch (error: any) {
    if (error instanceof PublicationDeletionConflict) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    throw error;
  }
});

// application/octet-stream is kept as a Readable and piped directly to disk. The
// route limit protects capacity without forcing Fastify to buffer the file in RAM.
app.put(
  "/v1/publications/:uploadId/files/*",
  { bodyLimit: env.maxUploadSizeBytes },
  async (request, reply) => {
    const { uploadId } = request.params as { uploadId: string };
    let relativePath: string;
    try {
      relativePath = decodeURIComponent(
        (request.params as Record<string, string>)["*"] ?? "",
      );
    } catch {
      return reply.code(400).send({ error: "Caminho inválido" });
    }
    if (!isSafeRelativePath(relativePath))
      return reply.code(400).send({ error: "Caminho inválido" });
    const publication = await prisma.publication.findUnique({
      where: { uploadId },
      select: { id: true, uploadId: true, state: true },
    });
    if (!publication)
      return reply.code(404).send({ error: "Publicação não encontrada" });
    if (["validating", "promoting", "confirmed"].includes(publication.state))
      return reply
        .code(409)
        .send({ error: "Publicação não aceita novos arquivos neste estado" });
    const file = await prisma.publicationFile.findUnique({
      where: {
        publicationId_relativePath: {
          publicationId: publication.id,
          relativePath,
        },
      },
    });
    if (!file) return reply.code(404).send({ error: "Arquivo não esperado" });
    const expectedHeader = request.headers["x-content-sha256"]
      ?.toString()
      .toLowerCase();
    if (!expectedHeader?.match(/^[a-f0-9]{64}$/))
      return reply.code(400).send({ error: "X-Content-SHA256 obrigatório" });
    const declaredBytes = Number(request.headers["content-length"]);
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes < 0 ||
      declaredBytes > env.maxUploadSizeBytes
    )
      return reply
        .code(413)
        .send({ error: "Content-Length inválido ou acima do limite" });
    if (
      file.expectedBytes !== null &&
      BigInt(declaredBytes) !== file.expectedBytes
    )
      return reply
        .code(409)
        .send({ error: "Tamanho não confere com o manifesto" });
    if (file.expectedSha256 && expectedHeader !== file.expectedSha256)
      return reply
        .code(409)
        .send({ error: "Hash declarado não confere com o manifesto" });
    // A proxy can lose the response after the file and database update completed.
    // Retrying the same idempotent PUT must then finish immediately instead of
    // writing and hashing the segment again.
    if (
      file.receivedAt &&
      file.receivedSha256 === expectedHeader &&
      file.receivedBytes === BigInt(declaredBytes)
    ) {
      return {
        upload_id: publication.uploadId,
        state: "uploading",
        received_path: relativePath,
        already_received: true,
      };
    }
    const uploadKey = `${publication.id}:${relativePath}`;
    if (activeUploads.has(uploadKey)) {
      return reply.header("Retry-After", "2").code(425).send({
        error: "Este arquivo já está sendo recebido",
        relativePath,
      });
    }
    activeUploads.add(uploadKey);
    try {
      const destination = safeDataPath(
        "staging",
        uploadId,
        "files",
        relativePath,
      );
      const temporary = `${destination}.tmp-${crypto.randomUUID()}`;
      await ensureUploadDirectory(path.dirname(destination));
      const hash = crypto.createHash("sha256");
      let bytes = 0;
      const limiter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          if (bytes > declaredBytes || bytes > env.maxUploadSizeBytes)
            callback(new Error("Upload excedeu o tamanho declarado"));
          else {
            hash.update(chunk);
            callback(null, chunk);
          }
        },
      });
      try {
        const stream =
          request.body instanceof Readable ? request.body : request.raw;
        await pipeline(
          stream,
          limiter,
          fs.createWriteStream(temporary, { flags: "wx" }),
        );
        const receivedSha256 = hash.digest("hex");
        if (bytes !== declaredBytes)
          throw new UploadConflict(
            "Tamanho recebido não confere com Content-Length",
          );
        if (
          receivedSha256 !== expectedHeader ||
          (file.expectedSha256 && receivedSha256 !== file.expectedSha256)
        )
          throw new UploadConflict("SHA-256 recebido não confere");
        await fs.promises.rm(destination, { force: true });
        await fs.promises.rename(temporary, destination);
        await prisma.publicationFile.update({
          where: { id: file.id },
          data: {
            receivedSha256,
            receivedBytes: BigInt(bytes),
            receivedAt: new Date(),
          },
        });
      } catch (error: any) {
        await fs.promises.rm(temporary, { force: true });
        if (error instanceof UploadConflict)
          return reply
            .code(409)
            .send({ error: error.message, relativePath, receivedBytes: bytes });
        throw error;
      }
      return {
        upload_id: publication.uploadId,
        state: "uploading",
        received_path: relativePath,
      };
    } finally {
      activeUploads.delete(uploadKey);
    }
  },
);

// Single-archive stream upload endpoint (tar format).
// Extracts all package files in a single continuous stream directly to staging,
// avoiding thousands of individual HTTP round-trips and DB updates.
app.put(
  "/v1/publications/:uploadId/archive",
  { bodyLimit: env.maxPackageSizeBytes },
  async (request, reply) => {
    const { uploadId } = request.params as { uploadId: string };
    const publication = await prisma.publication.findUnique({
      where: { uploadId },
      include: { files: true },
    });
    if (!publication)
      return reply.code(404).send({ error: "Publicação não encontrada" });
    if (["validating", "promoting", "confirmed"].includes(publication.state)) {
      return reply
        .code(409)
        .send({ error: "Publicação não aceita novos arquivos neste estado" });
    }

    const uploadKey = `${publication.id}:archive_stream`;
    if (activeUploads.has(uploadKey)) {
      return reply
        .header("Retry-After", "5")
        .code(425)
        .send({ error: "Envio de arquivo em lote já está em andamento" });
    }
    activeUploads.add(uploadKey);

    const stagingRoot = safeDataPath("staging", uploadId, "files");
    await ensureUploadDirectory(stagingRoot);

    const fileMap = new Map<
      string,
      {
        id: string;
        expectedSha256: string | null;
        expectedBytes: bigint | null;
      }
    >();
    for (const f of publication.files) {
      fileMap.set(f.relativePath, {
        id: f.id,
        expectedSha256: f.expectedSha256,
        expectedBytes: f.expectedBytes,
      });
    }

    const updatedFiles: Array<{
      id: string;
      receivedSha256: string;
      receivedBytes: bigint;
    }> = [];
    let buffer = Buffer.alloc(0);
    let state: "HEADER" | "CONTENT" | "PADDING" | "DONE" = "HEADER";
    let currentPath: string | null = null;
    let currentSize = 0;
    let bytesWritten = 0;
    let paddingRemaining = 0;
    let currentFileStream: fs.WriteStream | null = null;
    let currentHash: crypto.Hash | null = null;
    let paxNextPath: string | null = null;

    const closeCurrentFile = async () => {
      if (currentFileStream) {
        const fsStream = currentFileStream;
        currentFileStream = null;
        await new Promise<void>((resolve, reject) => {
          fsStream.end((err: Error | null) => (err ? reject(err) : resolve()));
        });
        if (currentPath && currentHash) {
          const receivedSha256 = currentHash.digest("hex");
          const fileInfo = fileMap.get(currentPath);
          if (fileInfo) {
            if (
              fileInfo.expectedSha256 &&
              receivedSha256 !== fileInfo.expectedSha256
            ) {
              throw new Error(
                `SHA-256 do arquivo ${currentPath} não confere com o manifesto`,
              );
            }
            updatedFiles.push({
              id: fileInfo.id,
              receivedSha256,
              receivedBytes: BigInt(bytesWritten),
            });
          }
        }
      }
    };

    const processChunk = async (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length > 0 && state !== "DONE") {
        if (state === "HEADER") {
          if (buffer.length < 512) return;
          const headerBuf = buffer.subarray(0, 512);
          buffer = buffer.subarray(512);

          let allZero = true;
          for (let i = 0; i < 512; i++) {
            if (headerBuf[i] !== 0) {
              allZero = false;
              break;
            }
          }
          if (allZero) {
            state = "DONE";
            return;
          }

          let name = headerBuf
            .toString("utf8", 0, 100)
            .replace(/\0.*$/, "")
            .trim();
          const prefix = headerBuf
            .toString("utf8", 345, 500)
            .replace(/\0.*$/, "")
            .trim();
          if (prefix) name = `${prefix}/${name}`;
          if (paxNextPath) {
            name = paxNextPath;
            paxNextPath = null;
          }

          const sizeStr = headerBuf
            .toString("utf8", 124, 136)
            .replace(/\0.*$/, "")
            .trim();
          currentSize = parseInt(sizeStr, 8) || 0;
          const typeflag = String.fromCharCode(headerBuf[156]);

          if (typeflag === "x" || typeflag === "g") {
            // PAX extended header
            const paxData = buffer.subarray(0, currentSize).toString("utf8");
            const match = paxData.match(/\d+ path=(.+)\n/);
            if (match) paxNextPath = match[1].trim();
            paddingRemaining = (512 - (currentSize % 512)) % 512;
            buffer = buffer.subarray(currentSize);
            state = "PADDING";
            continue;
          }

          if (typeflag === "5" || (!name && currentSize === 0)) {
            // Directory entry
            paddingRemaining = 0;
            state = "HEADER";
            continue;
          }

          const normalized = name.replaceAll("\\", "/").replace(/^\/+/, "");
          if (!isSafeRelativePath(normalized)) {
            throw new Error(
              `Caminho inseguro no arquivo do pacote: ${normalized}`,
            );
          }

          currentPath = normalized;
          const destination = safeDataPath(
            "staging",
            uploadId,
            "files",
            currentPath,
          );
          await ensureUploadDirectory(path.dirname(destination));
          currentFileStream = fs.createWriteStream(destination);
          currentHash = crypto.createHash("sha256");
          bytesWritten = 0;
          paddingRemaining = (512 - (currentSize % 512)) % 512;

          if (currentSize === 0) {
            await closeCurrentFile();
            state = paddingRemaining > 0 ? "PADDING" : "HEADER";
          } else {
            state = "CONTENT";
          }
        } else if (state === "CONTENT") {
          const needed = currentSize - bytesWritten;
          const toTake = Math.min(buffer.length, needed);
          const dataSlice = buffer.subarray(0, toTake);
          buffer = buffer.subarray(toTake);

          if (currentFileStream) {
            const canWrite = currentFileStream.write(dataSlice);
            if (!canWrite) {
              await new Promise<void>((resolve) =>
                currentFileStream!.once("drain", resolve),
              );
            }
          }
          if (currentHash) currentHash.update(dataSlice);
          bytesWritten += toTake;

          if (bytesWritten >= currentSize) {
            await closeCurrentFile();
            state = paddingRemaining > 0 ? "PADDING" : "HEADER";
          }
        } else if (state === "PADDING") {
          if (buffer.length < paddingRemaining) {
            paddingRemaining -= buffer.length;
            buffer = Buffer.alloc(0);
            return;
          }
          buffer = buffer.subarray(paddingRemaining);
          paddingRemaining = 0;
          state = "HEADER";
        }
      }
    };

    try {
      const rawStream =
        request.body instanceof Readable ? request.body : request.raw;
      for await (const chunk of rawStream) {
        await processChunk(chunk as Buffer);
      }
      await closeCurrentFile();

      // Batch update all received files in a single transaction
      const now = new Date();
      await prisma.$transaction(
        updatedFiles.map((item) =>
          prisma.publicationFile.update({
            where: { id: item.id },
            data: {
              receivedSha256: item.receivedSha256,
              receivedBytes: item.receivedBytes,
              receivedAt: now,
            },
          }),
        ),
      );

      return {
        upload_id: publication.uploadId,
        state: "uploading",
        extracted_files: updatedFiles.length,
      };
    } catch (error: any) {
      await closeCurrentFile();
      const msg = error instanceof Error ? error.message : String(error);
      return reply
        .code(400)
        .send({ error: `Falha na extração do pacote: ${msg}` });
    } finally {
      activeUploads.delete(uploadKey);
    }
  },
);

app.post("/v1/publications/:uploadId/complete", async (request, reply) => {
  const { uploadId } = request.params as { uploadId: string };
  const publication = await prisma.publication.findUnique({
    where: { uploadId },
    include: { files: true, receipt: true },
  });
  if (!publication)
    return reply.code(404).send({ error: "Publicação não encontrada" });
  if (publication.receipt) return publicationStatus(publication.id, reply);
  if (["validating", "promoting"].includes(publication.state)) {
    return publicationStatus(publication.id, reply.code(202));
  }
  const missing = publication.files
    .filter((file) => !file.receivedAt)
    .map((file) => file.relativePath);
  if (missing.length)
    return reply
      .code(409)
      .send({ error: "Arquivos pendentes", missing_paths: missing });
  const receivedTotal = publication.files.reduce(
    (sum, file) => sum + (file.receivedBytes ?? 0n),
    0n,
  );
  if (
    publication.totalSizeBytes === null ||
    receivedTotal !== publication.totalSizeBytes
  ) {
    return reply.code(409).send({
      error: "Tamanho total recebido diverge do tamanho declarado",
      declared_bytes: publication.totalSizeBytes?.toString(),
      received_bytes: receivedTotal.toString(),
    });
  }
  const claimed = await prisma.publication.updateMany({
    where: {
      id: publication.id,
      state: { in: ["waiting_files", "uploading", "ready", "failed"] },
    },
    data: {
      state: "validating",
      errorMessage: null,
      finalizationAttempts: 0,
      finalizationWorkerId: null,
      finalizationLeaseUntil: null,
      finalizationHeartbeatAt: null,
      finalizationNextAttemptAt: null,
    },
  });
  if (!claimed.count) {
    const current = await prisma.publication.findUnique({
      where: { id: publication.id },
      select: { state: true },
    });
    return publicationStatus(
      publication.id,
      reply.code(
        current && ["validating", "promoting"].includes(current.state)
          ? 202
          : 200,
      ),
    );
  }
  return publicationStatus(publication.id, reply.code(202));
});

async function publicationStatus(publicationId: string, reply: FastifyReply) {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    include: { files: true, receipt: true },
  });
  if (!publication)
    return reply.code(404).send({ error: "Publicação não encontrada" });
  return toJson({
    upload_id: publication.uploadId,
    state: publication.state,
    error: publication.errorMessage,
    missing_paths: publication.files
      .filter((item) => !item.receivedAt)
      .map((item) => item.relativePath),
    received_paths: publication.files
      .filter((item) => item.receivedAt)
      .map((item) => item.relativePath),
    receipt: publication.receipt
      ? {
          publication_id: publication.receipt.publicationId,
          package_id: publication.receipt.packageId,
          remote_work_id: publication.receipt.remoteWorkId,
          remote_season_id: publication.receipt.remoteSeasonId,
          remote_episode_ids: publication.receipt.remoteEpisodeIds,
          remote_revision: publication.receipt.remoteRevision,
          manifest_sha256: publication.receipt.manifestSha256,
          status: publication.receipt.status,
          confirmed_at: publication.receipt.confirmedAt,
        }
      : null,
  });
}

class PublicationDeletionConflict extends Error {
  constructor(
    message: string,
    readonly statusCode = 409,
  ) {
    super(message);
  }
}

}
