import type { FastifyInstance } from "fastify";
import path from "node:path";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, findRevisionCleanupCandidates } from "@cyanflix/database";
import { manifestSchema, manifestHash, type PackageManifest } from "@cyanflix/contracts";
import { env } from "../../lib/config.js";
import { safeDataPath, ensureUploadDirectory } from "../../lib/storage.js";
import { sessionIdentity } from "../../lib/auth-guards.js";
import { jsonValue, readMetadataString, chunks, toJson } from "../../lib/mappers.js";
import { publicationStatus } from "../../services/deletion.js";


export async function adminRevisionsRoutes(app: FastifyInstance) {
app.get("/api/admin/revisions", async () => {
  const revisions = await prisma.revision.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      publication: {
        select: {
          packageId: true,
          packageType: true,
          state: true,
          receipt: { select: { status: true } },
        },
      },
    },
  });
  return toJson(
    revisions.map((revision) => {
      const snapshot = manifestSchema.safeParse(revision.snapshot);
      return {
        id: revision.id,
        scopeKey: revision.scopeKey,
        number: revision.number,
        active: revision.active,
        createdAt: revision.createdAt,
        publicationId: revision.publicationId,
        packageId: revision.publication.packageId,
        packageType: revision.publication.packageType,
        publicationState: revision.publication.state,
        receiptStatus: revision.publication.receipt?.status ?? null,
        workTitle: snapshot.success
          ? snapshot.data.work.title
          : "Manifesto inválido",
        seasonTitle: snapshot.success
          ? (snapshot.data.season?.title ?? null)
          : null,
        episodeTitle: snapshot.success
          ? (snapshot.data.episodes[0]?.title ?? null)
          : null,
        episodeNumber: snapshot.success
          ? (snapshot.data.episodes[0]?.number ?? null)
          : null,
      };
    }),
  );
});
app.post("/api/admin/revisions/:id/activate", async (request, reply) => {
  const revision = await prisma.revision.findUnique({
    where: { id: (request.params as { id: string }).id },
    include: { publication: { select: { state: true } } },
  });
  if (!revision)
    return reply.code(404).send({ error: "Revisão não encontrada" });
  if (revision.publication.state !== "confirmed")
    return reply
      .code(409)
      .send({ error: "Somente revisões confirmadas podem ser ativadas" });
  if (revision.active) return reply.code(204).send();
  const targetManifest = manifestSchema.parse(revision.snapshot);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${revision.scopeKey}))`;
      await tx.revision.updateMany({
        where: { scopeKey: revision.scopeKey, active: true },
        data: { active: false },
      });
      await tx.revision.update({
        where: { id: revision.id },
        data: { active: true },
      });

      if (targetManifest.package_type === "season") {
        const season = await tx.season.findUnique({
          where: { stableId: targetManifest.season!.id },
        });
        if (!season) throw new Error("Temporada da revisão não encontrada");
        const history = await tx.revision.findMany({
          where: {
            scopeKey: revision.scopeKey,
            number: { lte: revision.number },
          },
          orderBy: { number: "asc" },
        });
        const episodeState = new Map<
          string,
          { revisionId: string; item: PackageManifest["episodes"][number] }
        >();
        for (const historicalRevision of history) {
          const manifest = manifestSchema.parse(historicalRevision.snapshot);
          for (const item of manifest.episodes)
            episodeState.set(item.id, {
              revisionId: historicalRevision.id,
              item,
            });
        }
        await tx.season.update({
          where: { id: season.id },
          data: {
            activeRevisionId: revision.id,
            number: targetManifest.season!.number,
            title: targetManifest.season!.title,
            metadata: jsonValue(targetManifest.season!.metadata),
            completeness: jsonValue(
              targetManifest.season!.publication_completeness,
            ),
          },
        });
        await tx.episode.updateMany({
          where: { seasonId: season.id },
          data: { activeRevisionId: null },
        });
        for (const [stableId, state] of episodeState) {
          await tx.episode.updateMany({
            where: { stableId, seasonId: season.id },
            data: {
              activeRevisionId: state.revisionId,
              number: state.item.number,
              absoluteNumber: state.item.absolute_number,
              title: state.item.title,
              synopsis:
                readMetadataString(state.item.metadata, "synopsis") ??
                readMetadataString(state.item.metadata, "overview"),
              metadata: jsonValue({
                ...state.item.metadata,
                delivery: state.item.delivery,
              }),
              markers: jsonValue(state.item.markers),
              sourceSha256: state.item.source_sha256,
              mediaManifest: state.item.media_manifest,
            },
          });
        }
        if (episodeState.size) {
          await tx.revision.updateMany({
            where: {
              scopeKey: {
                in: [...episodeState.keys()].map(
                  (stableId) => `episode:${stableId}`,
                ),
              },
              active: true,
            },
            data: { active: false },
          });
        }
      } else if (targetManifest.package_type === "episode_replacement") {
        const item = targetManifest.episodes[0];
        const season = await tx.season.findUnique({
          where: { stableId: targetManifest.season!.id },
        });
        if (!season)
          throw new Error("Temporada da substituição não encontrada");
        await tx.episode.updateMany({
          where: { stableId: item.id, seasonId: season.id },
          data: {
            activeRevisionId: revision.id,
            number: item.number,
            absoluteNumber: item.absolute_number,
            title: item.title,
            synopsis:
              readMetadataString(item.metadata, "synopsis") ??
              readMetadataString(item.metadata, "overview"),
            metadata: jsonValue({ ...item.metadata, delivery: item.delivery }),
            markers: jsonValue(item.markers),
            sourceSha256: item.source_sha256,
            mediaManifest: item.media_manifest,
          },
        });
      }
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 60_000,
    },
  );
  return reply.code(204).send();
});
app.get("/api/admin/revision-cleanup", async () => {
  const [candidates, jobs] = await Promise.all([
    findRevisionCleanupCandidates(
      env.revisionRetentionDays,
      env.revisionKeepPerScope,
    ),
    prisma.revisionCleanupJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return toJson({
    policy: {
      retentionDays: env.revisionRetentionDays,
      keepPerScope: env.revisionKeepPerScope,
    },
    candidates,
    jobs,
  });
});
app.post("/api/admin/revision-cleanup", async (request, reply) => {
  const identity = sessionIdentity(request);
  const requested = Array.isArray(
    (request.body as { publicationIds?: unknown })?.publicationIds,
  )
    ? (request.body as { publicationIds: unknown[] }).publicationIds
        .filter((id): id is string => typeof id === "string")
        .slice(0, 100)
    : [];
  if (!requested.length)
    return reply
      .code(400)
      .send({ error: "Selecione ao menos uma publicação elegível" });
  const candidates = await findRevisionCleanupCandidates(
    env.revisionRetentionDays,
    env.revisionKeepPerScope,
  );
  const byId = new Map(
    candidates.map((candidate) => [candidate.publicationId, candidate]),
  );
  const accepted = Array.from(new Set(requested)).flatMap(
    (id) => byId.get(id) ?? [],
  );
  if (!accepted.length)
    return reply
      .code(409)
      .send({ error: "As publicações selecionadas não são mais elegíveis" });
  await prisma.$transaction(async (tx) => {
    await tx.revisionCleanupJob.createMany({
      data: accepted.map((candidate) => ({
        publicationId: candidate.publicationId,
        requestedByAccountId: identity.accountId,
        sizeBytes: candidate.sizeBytes,
      })),
      skipDuplicates: true,
    });
    await tx.auditLog.create({
      data: {
        actorAccountId: identity.accountId,
        action: "revision_cleanup.queued",
        targetType: "publication",
        targetId: accepted
          .map((candidate) => candidate.publicationId)
          .join(",")
          .slice(0, 2_000),
        afterValue: jsonValue({
          publicationIds: accepted.map((candidate) => candidate.publicationId),
        }),
      },
    });
  });
  return reply.code(202).send({ queued: accepted.length });
});
app.post("/api/admin/revision-cleanup/:id/retry", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const result = await prisma.revisionCleanupJob.updateMany({
    where: { id, state: "failed" },
    data: {
      state: "queued",
      attempts: 0,
      error: null,
      workerId: null,
      leaseUntil: null,
    },
  });
  return result.count
    ? reply.code(202).send({ id, state: "queued" })
    : reply.code(409).send({ error: "Job não está em falha" });
});

// A season manifest inventories every HLS segment and can legitimately exceed the
// small global JSON limit. Keep the exception scoped to publication negotiation.
app.post(
  "/v1/publications",
  { bodyLimit: env.manifestBodyLimitBytes },
  async (request, reply) => {
    const body = request.body as {
      package_id?: string;
      idempotency_key?: string;
      manifest_sha256?: string;
      total_size_bytes?: number;
      manifest?: unknown;
    };
    const parsed = manifestSchema.safeParse(body?.manifest);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "Manifest inválido", details: parsed.error.flatten() });
    const manifest = parsed.data;
    if (
      body.package_id !== manifest.package_id ||
      body.idempotency_key !== manifest.idempotency_key ||
      body.manifest_sha256 !== manifest.manifest_sha256
    )
      return reply.code(409).send({ error: "Envelope e manifesto divergem" });
    const calculatedHash = manifestHash(
      manifest as unknown as Record<string, unknown>,
    );
    if (calculatedHash !== manifest.manifest_sha256)
      return reply.code(409).send({
        error: "manifest_sha256 não confere",
        expected: manifest.manifest_sha256,
        calculated: calculatedHash,
      });
    const totalSize = Number(body.total_size_bytes);
    if (
      !Number.isSafeInteger(totalSize) ||
      totalSize <= 0 ||
      totalSize > env.maxPackageSizeBytes
    )
      return reply
        .code(413)
        .send({ error: "Tamanho total do pacote inválido" });
    const expectedPaths = [
      "manifest.json",
      "checksums.sha256",
      ...(manifest.assets as any[]).map((asset: any) => asset.path),
    ];
    if (expectedPaths.length > env.maxPackageFiles)
      return reply
        .code(413)
        .send({ error: "Pacote excede o limite de arquivos" });
    if (new Set(expectedPaths).size !== expectedPaths.length)
      return reply.code(400).send({ error: "Caminho duplicado no pacote" });
    const existing = await prisma.publication.findUnique({
      where: { idempotencyKey: manifest.idempotency_key },
    });
    if (existing) {
      if (
        existing.manifestSha256 !== manifest.manifest_sha256 ||
        existing.packageId !== manifest.package_id
      )
        return reply
          .code(409)
          .send({ error: "Idempotency key já usada com outro pacote" });
      return publicationStatus(existing.id, reply);
    }
    const samePackage = await prisma.publication.findUnique({
      where: { packageId: manifest.package_id },
    });
    if (samePackage)
      return reply.code(409).send({ error: "package_id já utilizado" });
    const uploadId = `upl_${crypto.randomUUID()}`;
    const assetByPath = new Map(
      (manifest.assets as any[]).map((asset: any) => [asset.path, asset]),
    );
    const publication = await prisma.$transaction(
      async (tx) => {
        const created = await tx.publication.create({
          data: {
            uploadId,
            packageId: manifest.package_id,
            idempotencyKey: manifest.idempotency_key,
            packageType: manifest.package_type,
            manifestSha256: manifest.manifest_sha256,
            manifest: jsonValue(manifest),
            totalSizeBytes: BigInt(totalSize),
          },
        });
        const records = expectedPaths.map((relativePath) => {
          const asset = assetByPath.get(relativePath);
          return {
            publicationId: created.id,
            relativePath,
            expectedSha256: asset?.sha256,
            expectedBytes: asset ? BigInt(asset.size_bytes) : undefined,
          };
        });
        for (const rows of chunks(records, 1000))
          await tx.publicationFile.createMany({ data: rows });
        return created;
      },
      { timeout: 60_000 },
    );
    try {
      const directories = new Set(
        expectedPaths.map((relativePath) =>
          path.dirname(
            safeDataPath("staging", uploadId, "files", relativePath),
          ),
        ),
      );
      await Promise.all(
        [...directories].map((directory) => ensureUploadDirectory(directory)),
      );
    } catch (error) {
      await prisma.publication.delete({ where: { id: publication.id } });
      throw error;
    }
    return publicationStatus(publication.id, reply);
  },
);

}
