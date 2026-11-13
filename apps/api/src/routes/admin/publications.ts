import type { FastifyInstance } from "fastify";
import { PublicationState } from "@prisma/client";
import { prisma } from "@cyanflix/database";
import { sessionIdentity, requireOwner } from "../../lib/auth-guards.js";
import { deletePublicationCompletely, PublicationDeletionConflict } from "../../services/deletion.js";
import { toJson } from "../../lib/mappers.js";
import { manifestAssetMap } from "../../lib/catalog-helpers.js";


export async function adminPublicationsRoutes(app: FastifyInstance) {
app.get("/api/admin/publications", async (request) => {
  const query = request.query as {
    cursor?: string;
    limit?: string;
    state?: string;
  };
  const limit = Math.min(
    100,
    Math.max(10, Number.parseInt(query.limit ?? "25", 10) || 25),
  );
  const state = Object.values(PublicationState).find(
    (value) => value === query.state,
  );
  const rows = await prisma.publication.findMany({
    where: state ? { state } : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: limit + 1,
    include: {
      receipt: true,
      revisions: {
        select: { id: true, number: true, scopeKey: true, active: true },
      },
      _count: { select: { files: true } },
    },
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return toJson({
    items,
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
  });
});
app.get("/api/admin/publications/:id", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const publication = await prisma.publication.findUnique({
    where: { id },
    include: {
      files: { orderBy: { relativePath: "asc" } },
      receipt: true,
      revisions: { orderBy: { number: "desc" } },
    },
  });
  if (!publication)
    return reply.code(404).send({ error: "Publicação não encontrada" });
  const revision = publication.revisions[0];
  const previous = revision
    ? await prisma.revision.findFirst({
        where: { scopeKey: revision.scopeKey, number: { lt: revision.number } },
        orderBy: { number: "desc" },
        select: { number: true, snapshot: true },
      })
    : null;
  const currentAssets = manifestAssetMap(publication.manifest);
  const previousAssets = manifestAssetMap(previous?.snapshot);
  const added = [...currentAssets.keys()].filter(
    (path) => !previousAssets.has(path),
  );
  const removed = [...previousAssets.keys()].filter(
    (path) => !currentAssets.has(path),
  );
  const changed = [...currentAssets.keys()].filter(
    (path) =>
      previousAssets.has(path) &&
      currentAssets.get(path) !== previousAssets.get(path),
  );
  return toJson({
    ...publication,
    diff: {
      previousRevision: previous?.number ?? null,
      added,
      removed,
      changed,
    },
  });
});
app.delete("/api/admin/publications/:id", async (request, reply) => {
  if (!requireOwner(request, reply)) return;
  const id = (request.params as { id: string }).id;
  const body = request.body as { confirmPackageId?: unknown };
  const confirmPackageId =
    typeof body?.confirmPackageId === "string"
      ? body.confirmPackageId.trim()
      : "";
  if (!confirmPackageId)
    return reply.code(400).send({
      error: "Digite o package_id completo para confirmar a exclusão",
    });
  try {
    const result = await deletePublicationCompletely(
      id,
      confirmPackageId,
      sessionIdentity(request).accountId,
    );
    return reply.send(result);
  } catch (error: any) {
    if (error instanceof PublicationDeletionConflict) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    throw error;
  }
});

app.post("/api/admin/publications/:id/retry", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const publication = await prisma.publication.findUnique({
    where: { id },
    include: {
      files: { select: { receivedAt: true } },
      receipt: { select: { id: true } },
    },
  });
  if (!publication)
    return reply.code(404).send({ error: "Publicação não encontrada" });
  if (publication.receipt)
    return reply.code(409).send({ error: "Publicação já confirmada" });
  if (publication.state !== "failed")
    return reply.code(409).send({
      error: "Somente publicações com falha podem ser reenfileiradas",
    });
  if (publication.files.some((file) => !file.receivedAt))
    return reply
      .code(409)
      .send({ error: "Publicação ainda possui arquivos pendentes" });
  const queued = await prisma.publication.updateMany({
    where: { id, state: "failed", receipt: null },
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
  return queued.count
    ? reply.code(202).send({ id, state: "validating" })
    : reply.code(409).send({ error: "Estado da publicação foi alterado" });
});
}
