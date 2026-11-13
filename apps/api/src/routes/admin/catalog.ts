import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@cyanflix/database";
import { stripCreditsMetadata } from "@cyanflix/contracts";
import { sessionIdentity, requireOwner } from "../../lib/auth-guards.js";
import { safeDataPath, ensureUploadDirectory } from "../../lib/storage.js";
import { convertVideoToMp4, extractMediaAudioOffset } from "../../lib/media.js";
import { activeWorkDeletions } from "../../lib/config.js";
import {
  readNestedArray,
  readNestedObject,
  readObject,
  readMetadataString,
  editorialAuditValue,
  toPresentationAssetDto,
  toWorkDetailsDto,
  toJson,
  jsonValue,
  workPresentationAssetTypes,
  seasonPresentationAssetTypes,
  episodePresentationAssetTypes,
} from "../../lib/mappers.js";
import {
  workDeletionPreview,
  deleteWorkCompletely,
  loadWorkDeletionState,
  WorkDeletionConflict,
} from "../../services/deletion.js";

export async function adminCatalogRoutes(app: FastifyInstance) {
app.get("/api/admin/catalog", async (request) => {
  const query = request.query as { q?: string; cursor?: string };
  const q = String(query.q ?? "")
    .trim()
    .slice(0, 200);
  const works = await prisma.work.findMany({
    where: q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { originalTitle: { contains: q, mode: "insensitive" } },
            {
              editorialOverride: {
                is: { title: { contains: q, mode: "insensitive" } },
              },
            },
          ],
        }
      : undefined,
    include: {
      editorialOverride: true,
      assets: {
        where: { type: { in: workPresentationAssetTypes } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          publicPath: true,
          sizeBytes: true,
          metadata: true,
          relativePath: true,
        },
      },
      _count: { select: { seasons: true, episodes: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: 51,
  });
  const hasMore = works.length > 50;
  const page = hasMore ? works.slice(0, 50) : works;
  return toJson({
    items: page.map((work) => ({
      id: work.id,
      canonicalTitle: work.title,
      canonicalSynopsis: work.synopsis,
      title: work.editorialOverride?.title ?? work.title,
      synopsis: work.editorialOverride?.synopsis ?? work.synopsis,
      contentKind: work.contentKind,
      year: work.year,
      hidden: work.editorialOverride?.hidden ?? work.hidden,
      featured: work.editorialOverride?.featured ?? false,
      override: work.editorialOverride
        ? {
            title: work.editorialOverride.title,
            synopsis: work.editorialOverride.synopsis,
            hidden: work.editorialOverride.hidden,
            featured: work.editorialOverride.featured,
            updatedAt: work.editorialOverride.updatedAt,
          }
        : null,
      seasonCount: work._count.seasons,
      episodeCount: work._count.episodes,
      assets: work.assets.map(toPresentationAssetDto),
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  });
});

app.get("/api/admin/works/:id", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const work = await prisma.work.findUnique({
    where: { id },
    include: {
      editorialOverride: true,
      assets: {
        where: { type: { in: workPresentationAssetTypes } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          publicPath: true,
          sizeBytes: true,
          metadata: true,
          relativePath: true,
        },
      },
      seasons: {
        orderBy: { number: "asc" },
        include: {
          assets: {
            where: { type: { in: seasonPresentationAssetTypes } },
            select: { id: true, type: true, publicPath: true, sizeBytes: true },
          },
          episodes: {
            orderBy: { number: "asc" },
            include: {
              assets: {
                where: { type: { in: episodePresentationAssetTypes } },
                select: {
                  id: true,
                  type: true,
                  publicPath: true,
                  sizeBytes: true,
                },
              },
            },
          },
        },
      },
    },
  });
  return work
    ? toJson(work)
    : reply.code(404).send({ error: "Obra não encontrada" });
});
app.get("/api/admin/works/:id/deletion-preview", async (request, reply) => {
  if (!requireOwner(request, reply)) return;
  const id = (request.params as { id: string }).id;
  const state = await loadWorkDeletionState(id);
  if (!state) return reply.code(404).send({ error: "Obra não encontrada" });
  return toJson(workDeletionPreview(state));
});
app.delete("/api/admin/works/:id", async (request, reply) => {
  if (!requireOwner(request, reply)) return;
  const id = (request.params as { id: string }).id;
  const body = request.body as { confirmTitle?: unknown };
  const confirmTitle =
    typeof body?.confirmTitle === "string" ? body.confirmTitle.trim() : "";
  if (!confirmTitle)
    return reply.code(400).send({
      error: "Digite o título canônico completo para confirmar a exclusão",
    });
  if (activeWorkDeletions.has(id)) {
    return reply.code(409).send({ error: "Esta obra já está sendo excluída" });
  }
  activeWorkDeletions.add(id);
  try {
    const result = await deleteWorkCompletely(
      id,
      confirmTitle,
      sessionIdentity(request).accountId,
    );
    return reply.send(toJson(result));
  } catch (error: any) {
    if (error instanceof WorkDeletionConflict) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    throw error;
  } finally {
    activeWorkDeletions.delete(id);
  }
});
app.patch("/api/admin/seasons/:id", async (request, reply) => {
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  const body = request.body as { hidden?: unknown };
  if (typeof body.hidden !== "boolean")
    return reply.code(400).send({ error: "Visibilidade inválida" });
  const before = await prisma.season.findUnique({
    where: { id },
    select: { id: true, hidden: true, workId: true },
  });
  if (!before)
    return reply.code(404).send({ error: "Temporada não encontrada" });
  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.season.update({
      where: { id },
      data: { hidden: body.hidden as boolean },
      select: { id: true, hidden: true, workId: true },
    });
    await tx.auditLog.create({
      data: {
        actorAccountId: identity.accountId,
        action: "season.visibility_updated",
        targetType: "season",
        targetId: id,
        beforeValue: jsonValue(before),
        afterValue: jsonValue(value),
      },
    });
    return value;
  });
  return updated;
});
app.patch("/api/admin/episodes/:id", async (request, reply) => {
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  const body = request.body as { hidden?: unknown };
  if (typeof body.hidden !== "boolean")
    return reply.code(400).send({ error: "Visibilidade inválida" });
  const before = await prisma.episode.findUnique({
    where: { id },
    select: { id: true, hidden: true, workId: true, seasonId: true },
  });
  if (!before)
    return reply.code(404).send({ error: "Episódio não encontrado" });
  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.episode.update({
      where: { id },
      data: { hidden: body.hidden as boolean },
      select: { id: true, hidden: true, workId: true, seasonId: true },
    });
    await tx.auditLog.create({
      data: {
        actorAccountId: identity.accountId,
        action: "episode.visibility_updated",
        targetType: "episode",
        targetId: id,
        beforeValue: jsonValue(before),
        afterValue: jsonValue(value),
      },
    });
    return value;
  });
  return updated;
});
app.patch("/api/admin/works/:id/presentation", async (request, reply) => {
  const identity = sessionIdentity(request);
  const workId = (request.params as { id: string }).id;
  const body = request.body as { assetType?: unknown; assetId?: unknown };
  if (typeof body.assetType !== "string" || typeof body.assetId !== "string")
    return reply.code(400).send({ error: "Asset inválido" });
  const asset = await prisma.asset.findFirst({
    where: { id: body.assetId, workId, type: body.assetType },
    select: { id: true },
  });
  if (!asset)
    return reply
      .code(404)
      .send({ error: "Asset de apresentação não encontrado" });
  const current = await prisma.editorialOverride.findUnique({
    where: { workId },
  });
  const metadata = readObject(current?.metadata);
  const preferredAssets = {
    ...readObject(metadata.preferred_assets),
    [body.assetType]: body.assetId,
  };
  const override = await prisma.$transaction(async (tx) => {
    const value = await tx.editorialOverride.upsert({
      where: { workId },
      create: {
        workId,
        updatedByAccountId: identity.accountId,
        metadata: jsonValue({ ...metadata, preferred_assets: preferredAssets }),
      },
      update: {
        updatedByAccountId: identity.accountId,
        metadata: jsonValue({ ...metadata, preferred_assets: preferredAssets }),
      },
    });
    await tx.auditLog.create({
      data: {
        actorAccountId: identity.accountId,
        action: "work.presentation_asset_updated",
        targetType: "work",
        targetId: workId,
        beforeValue: jsonValue(editorialAuditValue(current)),
        afterValue: jsonValue(editorialAuditValue(value)),
      },
    });
    return value;
  });
  return toJson(override);
});
app.patch("/api/admin/works/:id/editorial", async (request, reply) => {
  const workId = (request.params as { id: string }).id;
  const identity = sessionIdentity(request);
  const body = request.body as {
    title?: unknown;
    synopsis?: unknown;
    hidden?: unknown;
    featured?: unknown;
  };
  if (
    body.title !== undefined &&
    body.title !== null &&
    typeof body.title !== "string"
  )
    return reply.code(400).send({ error: "Título inválido" });
  if (
    body.synopsis !== undefined &&
    body.synopsis !== null &&
    typeof body.synopsis !== "string"
  )
    return reply.code(400).send({ error: "Sinopse inválida" });
  if (typeof body.title === "string" && body.title.trim().length > 300)
    return reply.code(400).send({ error: "Título excede 300 caracteres" });
  if (typeof body.synopsis === "string" && body.synopsis.trim().length > 10_000)
    return reply.code(400).send({ error: "Sinopse excede 10.000 caracteres" });
  if (
    body.hidden !== undefined &&
    body.hidden !== null &&
    typeof body.hidden !== "boolean"
  )
    return reply.code(400).send({ error: "Visibilidade inválida" });
  if (
    body.featured !== undefined &&
    body.featured !== null &&
    typeof body.featured !== "boolean"
  )
    return reply.code(400).send({ error: "Destaque inválido" });

  const result = await prisma.$transaction(async (tx) => {
    const work = await tx.work.findUnique({
      where: { id: workId },
      include: { editorialOverride: true },
    });
    if (!work) return null;
    const cleanTitle: string | null | undefined =
      typeof body.title === "string"
        ? body.title.trim() || null
        : body.title === null
          ? null
          : undefined;
    const cleanSynopsis: string | null | undefined =
      typeof body.synopsis === "string"
        ? body.synopsis.trim() || null
        : body.synopsis === null
          ? null
          : undefined;
    const override = await tx.editorialOverride.upsert({
      where: { workId },
      create: {
        workId,
        updatedByAccountId: identity.accountId,
        title: cleanTitle ?? null,
        synopsis: cleanSynopsis ?? null,
        hidden: typeof body.hidden === "boolean" ? body.hidden : null,
        featured: typeof body.featured === "boolean" ? body.featured : null,
      },
      update: {
        updatedByAccountId: identity.accountId,
        ...(body.title !== undefined ? { title: cleanTitle ?? null } : {}),
        ...(body.synopsis !== undefined
          ? { synopsis: cleanSynopsis ?? null }
          : {}),
        ...(body.hidden !== undefined
          ? { hidden: body.hidden as boolean | null }
          : {}),
        ...(body.featured !== undefined
          ? { featured: body.featured as boolean | null }
          : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        actorAccountId: identity.accountId,
        action: "editorial_override.updated",
        targetType: "work",
        targetId: workId,
        beforeValue: jsonValue(editorialAuditValue(work.editorialOverride)),
        afterValue: jsonValue(editorialAuditValue(override)),
      },
    });
    return {
      id: workId,
      title: override.title ?? work.title,
      synopsis: override.synopsis ?? work.synopsis,
      hidden: override.hidden ?? work.hidden,
      featured: override.featured ?? false,
      override,
    };
  });
  return result
    ? toJson(result)
    : reply.code(404).send({ error: "Obra não encontrada" });
});
app.patch("/api/admin/works/:id/metadata", async (request, reply) => {
  const workId = (request.params as { id: string }).id;
  const identity = sessionIdentity(request);
  const body = request.body as {
    title?: unknown;
    originalTitle?: unknown;
    year?: unknown;
    contentKind?: unknown;
    synopsis?: unknown;
    hidden?: unknown;
    featured?: unknown;
    genres?: unknown;
    certification?: unknown;
    trailerUrl?: unknown;
  };

  const work = await prisma.work.findUnique({
    where: { id: workId },
    include: { editorialOverride: true },
  });
  if (!work) return reply.code(404).send({ error: "Obra não encontrada" });

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${work.stableId}))`;

      const currentWork = await tx.work.findUnique({ where: { id: workId } });
      if (!currentWork) return;

      const existingMeta = readObject(currentWork.metadata);
      const existingOverrideMeta = readObject(work.editorialOverride?.metadata);

      const workUpdates: Prisma.WorkUpdateInput = {};
      if (typeof body.year === "number" || body.year === null)
        workUpdates.year = body.year;
      if (typeof body.originalTitle === "string" || body.originalTitle === null)
        workUpdates.originalTitle = body.originalTitle?.trim() || null;
      if (
        typeof body.contentKind === "string" &&
        ["movie", "series", "anime"].includes(body.contentKind)
      ) {
        workUpdates.contentKind = body.contentKind as any;
      }

      const updatedMeta = stripCreditsMetadata({ ...existingMeta });
      if (Array.isArray(body.genres)) {
        updatedMeta.genres = body.genres
          .filter((g) => typeof g === "string" && g.trim())
          .map((g) => g.trim());
      }
      if (
        typeof body.certification === "string" ||
        body.certification === null
      ) {
        updatedMeta.certification = body.certification?.trim() || null;
      }
      if (typeof body.trailerUrl === "string" || body.trailerUrl === null) {
        updatedMeta.trailer_url = body.trailerUrl?.trim() || null;
      }
      workUpdates.metadata = jsonValue(updatedMeta);

      if (Object.keys(workUpdates).length > 0) {
        await tx.work.update({ where: { id: workId }, data: workUpdates });
      }

      const cleanTitle =
        typeof body.title === "string" ? body.title.trim() : undefined;
      const cleanSynopsis =
        typeof body.synopsis === "string" ? body.synopsis.trim() : undefined;
      const cleanHidden =
        typeof body.hidden === "boolean" ? body.hidden : undefined;
      const cleanFeatured =
        typeof body.featured === "boolean" ? body.featured : undefined;

      const updatedOverrideMeta = stripCreditsMetadata({
        ...existingOverrideMeta,
        ...updatedMeta,
      });

      await tx.editorialOverride.upsert({
        where: { workId },
        create: {
          workId,
          updatedByAccountId: identity.accountId,
          title: cleanTitle ?? null,
          synopsis: cleanSynopsis ?? null,
          hidden: cleanHidden ?? null,
          featured: cleanFeatured ?? null,
          metadata: jsonValue(updatedOverrideMeta),
        },
        update: {
          updatedByAccountId: identity.accountId,
          ...(cleanTitle !== undefined ? { title: cleanTitle || null } : {}),
          ...(cleanSynopsis !== undefined
            ? { synopsis: cleanSynopsis || null }
            : {}),
          ...(cleanHidden !== undefined ? { hidden: cleanHidden } : {}),
          ...(cleanFeatured !== undefined ? { featured: cleanFeatured } : {}),
          metadata: jsonValue(updatedOverrideMeta),
        },
      });
    },
    { timeout: 30_000 },
  );

  const updatedWork = await prisma.work.findUnique({
    where: { id: workId },
    include: {
      editorialOverride: true,
      assets: {
        where: { type: { in: workPresentationAssetTypes } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          publicPath: true,
          sizeBytes: true,
          metadata: true,
          relativePath: true,
        },
      },
      seasons: {
        orderBy: { number: "asc" },
        include: {
          assets: {
            where: { type: { in: seasonPresentationAssetTypes } },
            select: { id: true, type: true, publicPath: true, sizeBytes: true },
          },
          episodes: {
            orderBy: { number: "asc" },
            include: {
              assets: {
                where: { type: { in: episodePresentationAssetTypes } },
                select: {
                  id: true,
                  type: true,
                  publicPath: true,
                  sizeBytes: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return toJson(updatedWork);
});

app.patch("/api/admin/episodes/:id/metadata", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const identity = sessionIdentity(request);
  const body = request.body as {
    title?: unknown;
    synopsis?: unknown;
    hidden?: unknown;
    number?: unknown;
  };

  const before = await prisma.episode.findUnique({ where: { id } });
  if (!before)
    return reply.code(404).send({ error: "Episódio não encontrado" });

  const data: Prisma.EpisodeUpdateInput = {};
  if (typeof body.title === "string" || body.title === null)
    data.title = body.title?.trim() || null;
  if (typeof body.synopsis === "string" || body.synopsis === null)
    data.synopsis = body.synopsis?.trim() || null;
  if (typeof body.hidden === "boolean") data.hidden = body.hidden;
  if (typeof body.number === "number") data.number = body.number;

  const updated = await prisma.episode.update({
    where: { id },
    data,
    include: {
      assets: {
        where: { type: { in: episodePresentationAssetTypes } },
        select: { id: true, type: true, publicPath: true, sizeBytes: true },
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorAccountId: identity.accountId,
      action: "episode.metadata_updated",
      targetType: "episode",
      targetId: id,
      beforeValue: jsonValue(before),
      afterValue: jsonValue(updated),
    },
  });

  return toJson(updated);
});

app.patch("/api/admin/seasons/:id/metadata", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const identity = sessionIdentity(request);
  const body = request.body as { title?: unknown; hidden?: unknown };

  const before = await prisma.season.findUnique({ where: { id } });
  if (!before)
    return reply.code(404).send({ error: "Temporada não encontrada" });

  const data: Prisma.SeasonUpdateInput = {};
  if (typeof body.title === "string" || body.title === null)
    data.title = body.title?.trim() || null;
  if (typeof body.hidden === "boolean") data.hidden = body.hidden;

  const updated = await prisma.season.update({ where: { id }, data });
  await prisma.auditLog.create({
    data: {
      actorAccountId: identity.accountId,
      action: "season.metadata_updated",
      targetType: "season",
      targetId: id,
      beforeValue: jsonValue(before),
      afterValue: jsonValue(updated),
    },
  });
  return toJson(updated);
});

app.post(
  "/api/admin/works/:id/upload-asset",
  { bodyLimit: 500 * 1024 * 1024 },
  async (request, reply) => {
    const workId = (request.params as { id: string }).id;
    const query = request.query as { type?: string; filename?: string };
    const identity = sessionIdentity(request);
    const assetType = query.type ?? "trailer";
    if (!["trailer", "poster", "backdrop"].includes(assetType)) {
      return reply.code(400).send({
        error: "Tipo de asset inválido. Use trailer, poster ou backdrop.",
      });
    }

    const work = await prisma.work.findUnique({ where: { id: workId } });
    if (!work) return reply.code(404).send({ error: "Obra não encontrada" });

    const origName =
      query.filename ||
      (request.headers["x-original-name"] as string) ||
      "asset";
    const ext =
      path.extname(origName).toLowerCase() ||
      (assetType === "trailer" ? ".mp4" : ".webp");

    const customDir = safeDataPath("library", "custom", workId);
    await ensureUploadDirectory(customDir);

    const tempName = `temp_${Date.now()}_${crypto.randomUUID()}${ext}`;
    const tempPath = path.join(customDir, tempName);

    const hash = crypto.createHash("sha256");
    let sizeBytes = 0;
    const fileOut = fs.createWriteStream(tempPath);

    for await (const chunk of request.raw) {
      sizeBytes += (chunk as Buffer).length;
      hash.update(chunk as Buffer);
      fileOut.write(chunk);
    }
    await new Promise<void>((resolve, reject) => {
      fileOut.end((err: Error | null) => (err ? reject(err) : resolve()));
    });

    if (sizeBytes === 0) {
      try {
        await fs.promises.unlink(tempPath);
      } catch {}
      return reply.code(400).send({ error: "Nenhum arquivo enviado" });
    }

    let finalFileName = `${assetType}_${Date.now()}${ext}`;
    let finalPath = path.join(customDir, finalFileName);
    let finalSha256 = hash.digest("hex");

    if (
      assetType === "trailer" &&
      [".ts", ".mkv", ".mov", ".avi", ".flv"].includes(ext)
    ) {
      const mp4Name = `${assetType}_${Date.now()}.mp4`;
      const mp4Path = path.join(customDir, mp4Name);
      try {
        await convertVideoToMp4(tempPath, mp4Path);
        await fs.promises.unlink(tempPath).catch(() => {});
        finalFileName = mp4Name;
        finalPath = mp4Path;
        const stat = await fs.promises.stat(finalPath);
        sizeBytes = stat.size;
        const newHash = crypto.createHash("sha256");
        for await (const chunk of fs.createReadStream(finalPath))
          newHash.update(chunk as Buffer);
        finalSha256 = newHash.digest("hex");
      } catch {
        finalFileName = tempName;
        finalPath = tempPath;
      }
    } else {
      await fs.promises.rename(tempPath, finalPath);
    }

    const publicPath = `/media/custom/${workId}/${finalFileName}`;
    const asset = await prisma.asset.create({
      data: {
        stableId: crypto.randomUUID(),
        type: assetType === "backdrop" ? "hero" : assetType,
        relativePath: `custom/${workId}/${finalFileName}`,
        publicPath,
        sizeBytes: BigInt(sizeBytes),
        sha256: finalSha256,
        metadata: jsonValue({
          originalName: origName,
          uploadedAt: new Date().toISOString(),
        }),
        workId,
      },
    });

    const current = await prisma.editorialOverride.findUnique({
      where: { workId },
    });
    const currentMeta = readObject(current?.metadata);
    const preferredAssets = {
      ...readObject(currentMeta.preferred_assets),
      [assetType === "backdrop" ? "hero" : assetType]: asset.id,
    };
    await prisma.editorialOverride.upsert({
      where: { workId },
      create: {
        workId,
        updatedByAccountId: identity.accountId,
        metadata: jsonValue({
          ...currentMeta,
          preferred_assets: preferredAssets,
          ...(assetType === "trailer" ? { trailer_url: publicPath } : {}),
        }),
      },
      update: {
        updatedByAccountId: identity.accountId,
        metadata: jsonValue({
          ...currentMeta,
          preferred_assets: preferredAssets,
          ...(assetType === "trailer" ? { trailer_url: publicPath } : {}),
        }),
      },
    });

    return toJson({ asset });
  },
);

app.post(
  "/api/admin/episodes/:id/upload-thumbnail",
  { bodyLimit: 50 * 1024 * 1024 },
  async (request, reply) => {
    const episodeId = (request.params as { id: string }).id;
    const query = request.query as { filename?: string };
    const episode = await prisma.episode.findUnique({
      where: { id: episodeId },
      select: { id: true, workId: true },
    });
    if (!episode)
      return reply.code(404).send({ error: "Episódio não encontrado" });

    const origName = query.filename || "thumbnail.webp";
    const ext = path.extname(origName).toLowerCase() || ".webp";

    const customDir = safeDataPath(
      "library",
      "custom",
      episode.workId,
      "episodes",
      episodeId,
    );
    await ensureUploadDirectory(customDir);

    const finalFileName = `thumb_${Date.now()}${ext}`;
    const finalPath = path.join(customDir, finalFileName);

    const hash = crypto.createHash("sha256");
    let sizeBytes = 0;
    const fileOut = fs.createWriteStream(finalPath);

    for await (const chunk of request.raw) {
      sizeBytes += (chunk as Buffer).length;
      hash.update(chunk as Buffer);
      fileOut.write(chunk);
    }
    await new Promise<void>((resolve, reject) => {
      fileOut.end((err: Error | null) => (err ? reject(err) : resolve()));
    });

    if (sizeBytes === 0) {
      try {
        await fs.promises.unlink(finalPath);
      } catch {}
      return reply.code(400).send({ error: "Nenhum arquivo enviado" });
    }

    const publicPath = `/media/custom/${episode.workId}/episodes/${episodeId}/${finalFileName}`;
    const asset = await prisma.asset.create({
      data: {
        stableId: crypto.randomUUID(),
        type: "thumbnail_webp",
        relativePath: `custom/${episode.workId}/episodes/${episodeId}/${finalFileName}`,
        publicPath,
        sizeBytes: BigInt(sizeBytes),
        sha256: hash.digest("hex"),
        metadata: jsonValue({
          originalName: origName,
          uploadedAt: new Date().toISOString(),
        }),
        workId: episode.workId,
        episodeId,
      },
    });

    return toJson({ asset });
  },
);


app.get("/api/admin/works/:workId/playable-sources", async (request, reply) => {
  const { workId } = request.params as { workId: string };
  const work = await prisma.work.findUnique({
    where: { id: workId },
    include: {
      mediaObjects: {
        where: { kind: "movie_hls", publication: { state: "confirmed" } },
        orderBy: { createdAt: "desc" },
      },
      seasons: {
        orderBy: { number: "asc" },
        include: {
          episodes: {
            orderBy: { number: "asc" },
            include: {
              mediaObjects: {
                where: {
                  kind: "episode_hls",
                  publication: { state: "confirmed" },
                },
                orderBy: { createdAt: "desc" },
              },
            },
          },
        },
      },
    },
  });
  if (!work) return reply.code(404).send({ error: "Obra não encontrada" });

  const sources: Array<{
    id: string;
    label: string;
    mediaUrl: string;
    seasonNumber?: number;
    episodeNumber?: number;
    audioOffsetSeconds?: number;
  }> = [];

  if (work.contentKind === "movie" && work.mediaObjects[0]?.publicPath) {
    const media = work.mediaObjects[0];
    if (media.publicPath) {
      sources.push({
        id: work.id,
        label: "Filme Completo",
        mediaUrl: media.publicPath,
        audioOffsetSeconds: extractMediaAudioOffset(
          media.codecs,
          work.metadata,
        ),
      });
    }
  } else {
    for (const season of work.seasons) {
      for (const ep of season.episodes) {
        const media = ep.mediaObjects[0];
        if (media?.publicPath) {
          sources.push({
            id: ep.id,
            label: `T${season.number} E${ep.number}${ep.title ? ` - ${ep.title}` : ""}`,
            mediaUrl: media.publicPath,
            seasonNumber: season.number,
            episodeNumber: ep.number,
            audioOffsetSeconds: extractMediaAudioOffset(
              media.codecs,
              ep.metadata,
            ),
          });
        }
      }
    }
  }
  return toJson({
    workId: work.id,
    title: work.title,
    contentKind: work.contentKind,
    sources,
  });
});

}
