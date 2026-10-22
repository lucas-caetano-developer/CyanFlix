import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@cyanflix/database";
import {
  canonicalJson,
  isSafeRelativePath,
  manifestHash,
  manifestSchema,
  type PackageManifest,
} from "@cyanflix/contracts";

export type IngestionLogger = {
  info?: (bindings: object, message?: string) => void;
  error: (bindings: object, message?: string) => void;
};

export async function finalizePublication(
  publicationId: string,
  uploadId: string,
  dataRoot: string,
  log: IngestionLogger,
): Promise<void> {
  try {
    const publication = await prisma.publication.findUnique({
      where: { id: publicationId },
      include: { files: true, receipt: true },
    });
    if (!publication) throw new Error("Publicação não encontrada durante a finalização");
    if (publication.receipt) return;

    const manifest = manifestSchema.parse(publication.manifest);
    const stagingRoot = safeDataPath(dataRoot, "staging", uploadId, "files");
    const libraryRelativeRoot = `publications/${publication.id}`;
    const libraryRoot = safeDataPath(dataRoot, "library", libraryRelativeRoot);
    const sourceRoot = await directoryExists(stagingRoot) ? stagingRoot : libraryRoot;

    await validatePackage(
      sourceRoot,
      publication.files.map((file) => file.relativePath),
      manifest,
      publication.manifestSha256,
    );
    await prisma.publication.update({ where: { id: publication.id }, data: { state: "promoting" } });

    if (sourceRoot === stagingRoot) {
      await fs.promises.mkdir(path.dirname(libraryRoot), { recursive: true });
      if (await directoryExists(libraryRoot)) {
        throw new Error("Diretório final já existe para uma publicação não confirmada");
      }
      await fs.promises.rename(stagingRoot, libraryRoot);
    }

    await promoteManifest(publication.id, libraryRelativeRoot, manifest);
    log.info?.({ uploadId, publicationId }, "publication finalization completed");
  } catch (error) {
    log.error({ err: error, uploadId, publicationId }, "publication completion failed");
    throw error;
  }
}

async function promoteManifest(
  publicationId: string,
  libraryRelativeRoot: string,
  manifest: PackageManifest,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const replacement = manifest.package_type === "episode_replacement";
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${manifest.season ? manifest.season.id : manifest.work.id}))`;

    let work;
    if (replacement) {
      work = await tx.work.findUnique({ where: { stableId: manifest.work.id } });
      if (!work) throw new Error("A obra da substituição ainda não existe no catálogo");
    } else {
      work = await tx.work.upsert({
        where: { stableId: manifest.work.id },
        create: {
          stableId: manifest.work.id,
          contentKind: manifest.work.content_kind,
          title: manifest.work.title,
          originalTitle: manifest.work.original_title,
          year: manifest.work.year,
          synopsis: readNestedString(manifest.work.metadata, "overview"),
          searchText: buildSearchText(manifest.work.title, manifest.work.original_title, manifest.work.metadata),
          providerIds: jsonValue(manifest.work.provider_ids),
          metadata: jsonValue(manifest.work.metadata),
        },
        update: {
          contentKind: manifest.work.content_kind,
          title: manifest.work.title,
          originalTitle: manifest.work.original_title,
          year: manifest.work.year,
          synopsis: readNestedString(manifest.work.metadata, "overview"),
          searchText: buildSearchText(manifest.work.title, manifest.work.original_title, manifest.work.metadata),
          providerIds: jsonValue(manifest.work.provider_ids),
          metadata: jsonValue(manifest.work.metadata),
        },
      });
    }

    let season: { id: string; stableId: string } | null = null;
    const episodeMap: Record<string, string> = {};
    if (manifest.season) {
      const existingSeason = await tx.season.findUnique({ where: { stableId: manifest.season.id } });
      if (existingSeason && existingSeason.workId !== work.id) {
        throw new Error("ID estável da temporada pertence a outra obra");
      }
      if (replacement) {
        if (!existingSeason) throw new Error("A temporada da substituição ainda não existe no catálogo");
        season = { id: existingSeason.id, stableId: existingSeason.stableId };
      } else {
        season = await tx.season.upsert({
          where: { stableId: manifest.season.id },
          create: {
            stableId: manifest.season.id,
            workId: work.id,
            number: manifest.season.number,
            title: manifest.season.title,
            metadata: jsonValue(manifest.season.metadata),
            completeness: jsonValue(manifest.season.publication_completeness),
          },
          update: {
            number: manifest.season.number,
            title: manifest.season.title,
            metadata: jsonValue(manifest.season.metadata),
            completeness: jsonValue(manifest.season.publication_completeness),
          },
        });
      }
      for (const item of manifest.episodes) {
        const existing = await tx.episode.findUnique({ where: { stableId: item.id } });
        if (existing && (existing.workId !== work.id || existing.seasonId !== season.id)) {
          throw new Error(`ID estável do episódio ${item.id} pertence a outro escopo`);
        }
        const episode = await tx.episode.upsert({
          where: { stableId: item.id },
          create: {
            stableId: item.id,
            workId: work.id,
            seasonId: season.id,
            number: item.number,
            absoluteNumber: item.absolute_number,
            title: item.title,
            synopsis: readNestedString(item.metadata, "synopsis") ?? readNestedString(item.metadata, "overview"),
            metadata: jsonValue({ ...item.metadata, delivery: item.delivery }),
            markers: jsonValue(item.markers),
            sourceSha256: item.source_sha256,
            mediaManifest: item.media_manifest,
          },
          update: {
            number: item.number,
            absoluteNumber: item.absolute_number,
            title: item.title,
            synopsis: readNestedString(item.metadata, "synopsis") ?? readNestedString(item.metadata, "overview"),
            metadata: jsonValue({ ...item.metadata, delivery: item.delivery }),
            markers: jsonValue(item.markers),
            sourceSha256: item.source_sha256,
            mediaManifest: item.media_manifest,
          },
        });
        episodeMap[item.id] = episode.id;
      }
    }

    const assetRows = manifest.assets.map((asset) => ({
      stableId: asset.id,
      type: asset.type,
      relativePath: asset.path,
      publicPath: `/media/${libraryRelativeRoot}/${asset.path}`,
      sizeBytes: BigInt(asset.size_bytes),
      sha256: asset.sha256,
      metadata: asset.metadata as Prisma.InputJsonValue,
      workId: work.id,
      seasonId: asset.season_id ? season?.id ?? null : null,
      episodeId: asset.episode_id ? episodeMap[asset.episode_id] : null,
      publicationId,
    }));
    for (const rows of chunks(assetRows, 1000)) await tx.asset.createMany({ data: rows });

    if (manifest.package_type === "movie") {
      await tx.mediaObject.create({
        data: {
          kind: "movie_hls",
          relativePath: manifest.movie!.media_manifest,
          publicPath: `/media/${libraryRelativeRoot}/${manifest.movie!.media_manifest}`,
          codecs: jsonValue({ delivery: manifest.movie!.delivery, markers: manifest.movie!.markers }),
          workId: work.id,
          publicationId,
        },
      });
    } else {
      await tx.mediaObject.createMany({
        data: manifest.episodes.map((item) => ({
          kind: "episode_hls",
          relativePath: item.media_manifest,
          publicPath: `/media/${libraryRelativeRoot}/${item.media_manifest}`,
          codecs: item.delivery as Prisma.InputJsonValue,
          workId: work.id,
          episodeId: episodeMap[item.id],
          publicationId,
        })),
      });
    }

    const scopeKey = replacement
      ? `episode:${manifest.episodes[0].id}`
      : manifest.package_type === "season"
        ? `season:${manifest.season!.id}`
        : `movie:${manifest.work.id}`;
    const latest = await tx.revision.aggregate({ where: { scopeKey }, _max: { number: true } });
    const revisionNumber = (latest._max.number ?? 0) + 1;
    await tx.revision.updateMany({ where: { scopeKey, active: true }, data: { active: false } });
    if (manifest.package_type === "season") {
      // A full/partial season revision is authoritative for the episodes it
      // contains, so previous per-episode replacements no longer override it.
      await tx.revision.updateMany({
        where: { scopeKey: { in: manifest.episodes.map((item) => `episode:${item.id}`) }, active: true },
        data: { active: false },
      });
    }
    const revision = await tx.revision.create({
      data: { publicationId, scopeKey, number: revisionNumber, snapshot: jsonValue(manifest) },
    });
    if (manifest.package_type === "season") {
      await tx.season.update({ where: { id: season!.id }, data: { activeRevisionId: revision.id } });
      await tx.episode.updateMany({
        where: { id: { in: Object.values(episodeMap) } },
        data: { activeRevisionId: revision.id },
      });
    } else if (replacement) {
      await tx.episode.updateMany({
        where: { stableId: manifest.episodes[0].id, seasonId: season!.id },
        data: { activeRevisionId: revision.id },
      });
    }
    await tx.publicationReceipt.create({
      data: {
        publicationId,
        packageId: manifest.package_id,
        remoteWorkId: work.id,
        remoteSeasonId: season?.id,
        remoteEpisodeIds: episodeMap,
        remoteRevision: revisionNumber,
        manifestSha256: manifest.manifest_sha256,
      },
    });
    await tx.publication.update({
      where: { id: publicationId },
      data: { state: "confirmed", confirmedAt: new Date(), errorMessage: null },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}

async function validatePackage(
  root: string,
  expectedPaths: string[],
  storedManifest: PackageManifest,
  expectedManifestHash: string,
): Promise<void> {
  const actualPaths = await listFiles(root);
  const expectedPathSet = new Set(expectedPaths);
  if (actualPaths.length !== expectedPaths.length || actualPaths.some((item) => !expectedPathSet.has(item))) {
    throw new Error("Conteúdo do pacote difere dos caminhos declarados");
  }
  const uploadedManifest = manifestSchema.parse(
    JSON.parse(await fs.promises.readFile(path.join(root, "manifest.json"), "utf8")),
  );
  if (manifestHash(uploadedManifest as unknown as Record<string, unknown>) !== expectedManifestHash
      || uploadedManifest.manifest_sha256 !== expectedManifestHash) {
    throw new Error("Hash do manifest.json enviado não confere");
  }
  if (canonicalJson(uploadedManifest) !== canonicalJson(storedManifest)) {
    throw new Error("manifest.json enviado difere do manifesto iniciado");
  }
  const checksums = parseChecksums(
    await fs.promises.readFile(path.join(root, "checksums.sha256"), "utf8"),
  );
  const covered = expectedPaths.filter((item) => item !== "checksums.sha256").sort();
  const assetByPath = new Map(storedManifest.assets.map((asset) => [asset.path, asset]));
  if (checksums.size !== covered.length || covered.some((item) => !checksums.has(item))) {
    throw new Error("checksums.sha256 não cobre exatamente o pacote");
  }
  for (const relativePath of covered) {
    const absolute = path.join(root, ...relativePath.split("/"));
    const stat = await fs.promises.stat(absolute);
    const digest = await hashFile(absolute);
    if (checksums.get(relativePath) !== digest) throw new Error(`Checksum inválido para ${relativePath}`);
    const asset = assetByPath.get(relativePath);
    if (asset && (stat.size !== asset.size_bytes || digest !== asset.sha256)) {
      throw new Error(`Asset diverge do manifesto: ${relativePath}`);
    }
  }
}

function parseChecksums(content: string): Map<string, string> {
  const output = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^([a-fA-F0-9]{64})  (.+)$/);
    if (!match) throw new Error(`Linha inválida em checksums.sha256: ${line}`);
    const relativePath = match[2].replaceAll("\\", "/");
    if (!isSafeRelativePath(relativePath) || relativePath === "checksums.sha256") {
      throw new Error(`Caminho inválido em checksums.sha256: ${relativePath}`);
    }
    if (output.has(relativePath)) throw new Error(`Caminho duplicado em checksums.sha256: ${relativePath}`);
    output.set(relativePath, match[1].toLowerCase());
  }
  return output;
}

function safeDataPath(dataRoot: string, ...parts: string[]): string {
  const root = path.resolve(dataRoot);
  const target = path.resolve(root, ...parts.flatMap((part) => part.replaceAll("\\", "/").split("/")));
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("Caminho fora de DATA_ROOT");
  return target;
}

async function directoryExists(value: string): Promise<boolean> {
  try { return (await fs.promises.stat(value)).isDirectory(); } catch { return false; }
}

async function listFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  async function walk(current: string, prefix = ""): Promise<void> {
    for (const entry of await fs.promises.readdir(current, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) output.push(relative);
      else throw new Error(`Entrada não suportada: ${relative}`);
    }
  }
  await walk(root);
  return output.sort();
}

async function hashFile(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function readNestedString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === "string" && nested.trim() ? nested : null;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function buildSearchText(title: string, originalTitle: string | null | undefined, metadata: unknown): string {
  const values: string[] = [title];
  if (originalTitle) values.push(originalTitle);
  collectSearchStrings(metadata, values);
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(" ").slice(0, 100_000);
}

function collectSearchStrings(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    if (value.length <= 500 && !/^https?:\/\//i.test(value) && !/^[a-f0-9]{32,}$/i.test(value)) output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSearchStrings(item, output);
    return;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) collectSearchStrings(nested, output);
  }
}
