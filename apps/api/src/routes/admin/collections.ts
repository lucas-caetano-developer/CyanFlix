import type { FastifyInstance } from "fastify";
import { prisma } from "@cyanflix/database";
import { sessionIdentity } from "../../lib/auth-guards.js";
import {
  parseCollectionInput,
  collectionAuditValue,
  toWorkCardDto,
  toJson,
  jsonValue,
  normalizeCollectionSlug,
  workCardInclude,
  catalogAvailabilityWhere,
  catalogVisibilityWhere,
} from "../../lib/mappers.js";

export async function adminCollectionsRoutes(app: FastifyInstance) {
app.get("/api/admin/collections", async () =>
  toJson(
    await prisma.editorialCollection.findMany({
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      include: {
        items: {
          orderBy: { position: "asc" },
          include: {
            work: {
              select: {
                id: true,
                title: true,
                contentKind: true,
                editorialOverride: { select: { title: true, hidden: true } },
              },
            },
          },
        },
      },
    }),
  ),
);
app.post("/api/admin/collections", async (request, reply) => {
  const identity = sessionIdentity(request);
  const body = request.body as { title?: unknown; slug?: unknown };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const slug = normalizeCollectionSlug(
    typeof body.slug === "string" ? body.slug : title,
  );
  if (!title || title.length > 120)
    return reply
      .code(400)
      .send({ error: "Título obrigatório, com até 120 caracteres" });
  if (!slug) return reply.code(400).send({ error: "Slug inválido" });
  const existing = await prisma.editorialCollection.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing)
    return reply
      .code(409)
      .send({ error: "Já existe uma coleção com este slug" });
  const collection = await prisma.$transaction(async (tx) => {
    const created = await tx.editorialCollection.create({
      data: {
        title,
        slug,
        createdByAccountId: identity.accountId,
        updatedByAccountId: identity.accountId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorAccountId: identity.accountId,
        action: "editorial_collection.created",
        targetType: "editorial_collection",
        targetId: created.id,
        afterValue: jsonValue(collectionAuditValue(created, [])),
      },
    });
    return created;
  });
  return reply.code(201).send(toJson({ ...collection, items: [] }));
});
app.patch("/api/admin/collections/:id", async (request, reply) => {
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  const body = request.body as {
    title?: unknown;
    slug?: unknown;
    description?: unknown;
    active?: unknown;
    featured?: unknown;
    sortOrder?: unknown;
    workIds?: unknown;
  };
  const parsed = parseCollectionInput(body);
  if ("error" in parsed) return reply.code(400).send({ error: parsed.error });
  if (parsed.data.slug) {
    const duplicate = await prisma.editorialCollection.findFirst({
      where: { slug: parsed.data.slug, id: { not: id } },
      select: { id: true },
    });
    if (duplicate)
      return reply
        .code(409)
        .send({ error: "Já existe uma coleção com este slug" });
  }
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.editorialCollection.findUnique({
      where: { id },
      include: { items: { orderBy: { position: "asc" } } },
    });
    if (!current) return null;
    if (current.state === "published") return { conflict: true as const };
    if (parsed.workIds) {
      const found = await tx.work.count({
        where: { id: { in: parsed.workIds } },
      });
      if (found !== parsed.workIds.length) return { missing: true as const };
    }
    const updated = await tx.editorialCollection.update({
      where: { id },
      data: { ...parsed.data, updatedByAccountId: identity.accountId },
    });
    if (parsed.workIds) {
      await tx.editorialCollectionItem.deleteMany({
        where: { collectionId: id },
      });
      if (parsed.workIds.length)
        await tx.editorialCollectionItem.createMany({
          data: parsed.workIds.map((workId, position) => ({
            collectionId: id,
            workId,
            position,
          })),
        });
    }
    const workIds = parsed.workIds ?? current.items.map((item) => item.workId);
    await tx.auditLog.create({
      data: {
        actorAccountId: identity.accountId,
        action: "editorial_collection.draft_updated",
        targetType: "editorial_collection",
        targetId: id,
        beforeValue: jsonValue(
          collectionAuditValue(
            current,
            current.items.map((item) => item.workId),
          ),
        ),
        afterValue: jsonValue(collectionAuditValue(updated, workIds)),
      },
    });
    return { collection: updated, workIds };
  });
  if (!result) return reply.code(404).send({ error: "Coleção não encontrada" });
  if ("conflict" in result)
    return reply.code(409).send({
      error: "Coleções publicadas devem voltar para rascunho antes da edição",
    });
  if ("missing" in result)
    return reply.code(400).send({ error: "Uma ou mais obras não existem" });
  return toJson(result);
});
app.post("/api/admin/collections/:id/unpublish", async (request, reply) => {
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  const updated = await prisma.editorialCollection.updateMany({
    where: { id, state: "published" },
    data: {
      state: "draft",
      publishedAt: null,
      updatedByAccountId: identity.accountId,
    },
  });
  if (!updated.count)
    return reply.code(409).send({ error: "Coleção não está publicada" });
  await prisma.auditLog.create({
    data: {
      actorAccountId: identity.accountId,
      action: "editorial_collection.unpublished",
      targetType: "editorial_collection",
      targetId: id,
    },
  });
  return reply.code(204).send();
});
app.get("/api/admin/collections/:id/preview", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const collection = await prisma.editorialCollection.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: { work: { include: workCardInclude } },
      },
    },
  });
  if (!collection)
    return reply.code(404).send({ error: "Coleção não encontrada" });
  const eligibleIds = new Set(
    (
      await prisma.work.findMany({
        where: {
          id: { in: collection.items.map((item) => item.workId) },
          hidden: false,
          AND: [catalogAvailabilityWhere, catalogVisibilityWhere],
        },
        select: { id: true },
      })
    ).map((work) => work.id),
  );
  const items = collection.items.map((item) => ({
    work: toWorkCardDto(item.work),
    eligible: eligibleIds.has(item.workId),
  }));
  return toJson({
    id: collection.id,
    title: collection.title,
    state: collection.state,
    valid: items.length > 0 && items.every((item) => item.eligible),
    items,
  });
});
app.post("/api/admin/collections/:id/publish", async (request, reply) => {
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  const collection = await prisma.editorialCollection.findUnique({
    where: { id },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!collection)
    return reply.code(404).send({ error: "Coleção não encontrada" });
  const eligible = await prisma.work.count({
    where: {
      id: { in: collection.items.map((item) => item.workId) },
      hidden: false,
      AND: [catalogAvailabilityWhere, catalogVisibilityWhere],
    },
  });
  if (!collection.items.length || eligible !== collection.items.length)
    return reply.code(409).send({
      error: "A coleção possui obras ocultas, indisponíveis ou está vazia",
    });
  const publishedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.editorialCollection.update({
      where: { id },
      data: {
        state: "published",
        publishedAt,
        updatedByAccountId: identity.accountId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorAccountId: identity.accountId,
        action: "editorial_collection.published",
        targetType: "editorial_collection",
        targetId: id,
        beforeValue: jsonValue(
          collectionAuditValue(
            collection,
            collection.items.map((item) => item.workId),
          ),
        ),
        afterValue: jsonValue(
          collectionAuditValue(
            value,
            collection.items.map((item) => item.workId),
          ),
        ),
      },
    });
    return value;
  });
  return toJson(updated);
});
app.delete("/api/admin/collections/:id", async (request, reply) => {
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  const collection = await prisma.editorialCollection.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!collection)
    return reply.code(404).send({ error: "Coleção não encontrada" });
  if (collection.state === "published")
    return reply
      .code(409)
      .send({ error: "Retire a coleção da home antes de excluí-la" });
  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        actorAccountId: identity.accountId,
        action: "editorial_collection.deleted",
        targetType: "editorial_collection",
        targetId: id,
        beforeValue: jsonValue(
          collectionAuditValue(
            collection,
            collection.items.map((item) => item.workId),
          ),
        ),
      },
    }),
    prisma.editorialCollection.delete({ where: { id } }),
  ]);
  return reply.code(204).send();
});
}
