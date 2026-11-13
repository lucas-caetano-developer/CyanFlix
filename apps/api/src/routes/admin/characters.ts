import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@cyanflix/database";
import { toJson } from "../../lib/mappers.js";
import { safeDataPath, ensureUploadDirectory } from "../../lib/storage.js";
import { resolveAudioSource, extractAudioSegment, concatAudioSegments } from "../../lib/media.js";

export async function adminCharactersRoutes(app: FastifyInstance) {
/* ==========================================================================
   Characters (Personagens) API Endpoints
   ========================================================================== */

app.get("/api/admin/characters", async (request) => {
  const query = request.query as {
    workId?: string;
    voiceActorId?: string;
    q?: string;
  };
  const where: Prisma.CharacterWhereInput = {};
  if (query.workId) where.works = { some: { id: query.workId } };
  if (query.voiceActorId) where.voiceActorId = query.voiceActorId;
  if (query.q) {
    const q = query.q.trim().slice(0, 200);
    where.name = { contains: q, mode: "insensitive" };
  }

  const characters = await prisma.character.findMany({
    where,
    include: {
      works: {
        select: { id: true, title: true, contentKind: true, year: true },
      },
      voiceActor: { select: { id: true, name: true, photoUrl: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });
  return toJson(
    characters.map((c) => ({
      ...c,
      workId: c.works[0]?.id || "",
      work: c.works[0] || null,
    })),
  );
});

app.get("/api/admin/characters/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      works: {
        select: {
          id: true,
          title: true,
          contentKind: true,
          year: true,
          synopsis: true,
        },
      },
      voiceActor: true,
    },
  });
  if (!character)
    return reply.code(404).send({ error: "Personagem não encontrado" });
  return toJson({
    ...character,
    workId: character.works[0]?.id || "",
    work: character.works[0] || null,
  });
});

app.post("/api/admin/characters", async (request, reply) => {
  const body = request.body as {
    name?: string;
    workId?: string;
    workIds?: string[];
    photoUrl?: string | null;
    bodyPhotoUrl?: string | null;
    role?: string | null;
    archetype?: string | null;
    profileSentiments?: string | null;
    voiceAudioUrl?: string | null;
    voiceActorId?: string | null;
    themeColor?: string | null;
  };

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name)
    return reply.code(400).send({ error: "Nome do personagem é obrigatório" });
  if (name.length > 200)
    return reply.code(400).send({ error: "Nome excede 200 caracteres" });

  const rawWorkIds = Array.isArray(body?.workIds)
    ? body.workIds
    : typeof body?.workId === "string" && body.workId.trim()
      ? [body.workId.trim()]
      : [];
  const cleanWorkIds = [
    ...new Set(rawWorkIds.filter((id) => typeof id === "string" && id.trim())),
  ];
  if (cleanWorkIds.length === 0)
    return reply
      .code(400)
      .send({ error: "Ao menos uma obra vinculada é obrigatória" });

  const foundWorks = await prisma.work.findMany({
    where: { id: { in: cleanWorkIds } },
    select: { id: true },
  });
  if (foundWorks.length === 0)
    return reply.code(404).send({ error: "Obra vinculada não encontrada" });

  let voiceActorId =
    typeof body.voiceActorId === "string" && body.voiceActorId.trim()
      ? body.voiceActorId.trim()
      : null;
  if (voiceActorId) {
    const actor = await prisma.voiceActor.findUnique({
      where: { id: voiceActorId },
    });
    if (!actor) voiceActorId = null;
  }

  const character = await prisma.character.create({
    data: {
      name,
      works: { connect: foundWorks.map((w) => ({ id: w.id })) },
      photoUrl:
        typeof body.photoUrl === "string" && body.photoUrl.trim()
          ? body.photoUrl.trim()
          : null,
      bodyPhotoUrl:
        typeof body.bodyPhotoUrl === "string" && body.bodyPhotoUrl.trim()
          ? body.bodyPhotoUrl.trim()
          : null,
      role:
        typeof body.role === "string" && body.role.trim()
          ? body.role.trim()
          : null,
      archetype:
        typeof body.archetype === "string" && body.archetype.trim()
          ? body.archetype.trim()
          : null,
      profileSentiments:
        typeof body.profileSentiments === "string" &&
        body.profileSentiments.trim()
          ? body.profileSentiments.trim()
          : null,
      voiceAudioUrl:
        typeof body.voiceAudioUrl === "string" && body.voiceAudioUrl.trim()
          ? body.voiceAudioUrl.trim()
          : null,
      voiceActorId,
      themeColor:
        typeof body.themeColor === "string" && body.themeColor.trim()
          ? body.themeColor.trim()
          : null,
    },
    include: {
      works: {
        select: { id: true, title: true, contentKind: true, year: true },
      },
      voiceActor: { select: { id: true, name: true, photoUrl: true } },
    },
  });

  return reply.code(201).send(
    toJson({
      ...character,
      workId: character.works[0]?.id || "",
      work: character.works[0] || null,
    }),
  );
});

app.patch("/api/admin/characters/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as {
    name?: string;
    workId?: string;
    workIds?: string[];
    addWorkId?: string;
    removeWorkId?: string;
    photoUrl?: string | null;
    bodyPhotoUrl?: string | null;
    role?: string | null;
    archetype?: string | null;
    profileSentiments?: string | null;
    voiceAudioUrl?: string | null;
    voiceActorId?: string | null;
    themeColor?: string | null;
  };

  const character = await prisma.character.findUnique({ where: { id } });
  if (!character)
    return reply.code(404).send({ error: "Personagem não encontrado" });

  const data: Prisma.CharacterUpdateInput = {};
  if (body.name !== undefined) {
    const cleanName = typeof body.name === "string" ? body.name.trim() : "";
    if (!cleanName)
      return reply
        .code(400)
        .send({ error: "Nome do personagem não pode ser vazio" });
    data.name = cleanName;
  }
  if (Array.isArray(body.workIds)) {
    const validIds = body.workIds.filter(
      (wId) => typeof wId === "string" && wId.trim(),
    );
    data.works = { set: validIds.map((wId) => ({ id: wId })) };
  } else if (typeof body.addWorkId === "string" && body.addWorkId.trim()) {
    data.works = { connect: [{ id: body.addWorkId.trim() }] };
  } else if (
    typeof body.removeWorkId === "string" &&
    body.removeWorkId.trim()
  ) {
    data.works = { disconnect: [{ id: body.removeWorkId.trim() }] };
  } else if (body.workId !== undefined) {
    const cleanWorkId =
      typeof body.workId === "string" ? body.workId.trim() : "";
    if (cleanWorkId) {
      data.works = { connect: [{ id: cleanWorkId }] };
    }
  }
  if (body.photoUrl !== undefined) {
    data.photoUrl =
      typeof body.photoUrl === "string" && body.photoUrl.trim()
        ? body.photoUrl.trim()
        : null;
  }
  if (body.bodyPhotoUrl !== undefined) {
    data.bodyPhotoUrl =
      typeof body.bodyPhotoUrl === "string" && body.bodyPhotoUrl.trim()
        ? body.bodyPhotoUrl.trim()
        : null;
  }
  if (body.role !== undefined) {
    data.role =
      typeof body.role === "string" && body.role.trim()
        ? body.role.trim()
        : null;
  }
  if (body.archetype !== undefined) {
    data.archetype =
      typeof body.archetype === "string" && body.archetype.trim()
        ? body.archetype.trim()
        : null;
  }
  if (body.profileSentiments !== undefined) {
    data.profileSentiments =
      typeof body.profileSentiments === "string" &&
      body.profileSentiments.trim()
        ? body.profileSentiments.trim()
        : null;
  }
  if (body.voiceAudioUrl !== undefined) {
    data.voiceAudioUrl =
      typeof body.voiceAudioUrl === "string" && body.voiceAudioUrl.trim()
        ? body.voiceAudioUrl.trim()
        : null;
  }
  if (body.voiceActorId !== undefined) {
    const actorId =
      typeof body.voiceActorId === "string" && body.voiceActorId.trim()
        ? body.voiceActorId.trim()
        : null;
    if (actorId) {
      data.voiceActor = { connect: { id: actorId } };
    } else {
      data.voiceActor = { disconnect: true };
    }
  }
  if (body.themeColor !== undefined) {
    data.themeColor =
      typeof body.themeColor === "string" && body.themeColor.trim()
        ? body.themeColor.trim()
        : null;
  }

  const updated = await prisma.character.update({
    where: { id },
    data,
    include: {
      works: {
        select: { id: true, title: true, contentKind: true, year: true },
      },
      voiceActor: { select: { id: true, name: true, photoUrl: true } },
    },
  });

  return toJson({
    ...updated,
    workId: updated.works[0]?.id || "",
    work: updated.works[0] || null,
  });
});

app.delete("/api/admin/characters/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const character = await prisma.character.findUnique({ where: { id } });
  if (!character)
    return reply.code(404).send({ error: "Personagem não encontrado" });

  await prisma.character.delete({ where: { id } });
  return reply.code(204).send();
});

app.post(
  "/api/admin/characters/upload-photo",
  { bodyLimit: 25 * 1024 * 1024 },
  async (request, reply) => {
    const query = request.query as { filename?: string };
    const origName =
      query.filename ||
      (request.headers["x-original-name"] as string) ||
      "character.webp";
    const ext = path.extname(origName).toLowerCase() || ".webp";

    const targetDir = safeDataPath("library", "custom", "characters");
    await ensureUploadDirectory(targetDir);

    const finalFileName = `char_${Date.now()}_${crypto.randomUUID()}${ext}`;
    const finalPath = path.join(targetDir, finalFileName);

    const fileOut = fs.createWriteStream(finalPath);
    let sizeBytes = 0;
    for await (const chunk of request.raw) {
      sizeBytes += (chunk as Buffer).length;
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

    const publicPath = `/media/custom/characters/${finalFileName}`;
    return toJson({
      photoUrl: publicPath,
      bodyPhotoUrl: publicPath,
      url: publicPath,
    });
  },
);

app.post(
  "/api/admin/characters/upload-audio",
  { bodyLimit: 50 * 1024 * 1024 },
  async (request, reply) => {
    const query = request.query as { filename?: string };
    const origName =
      query.filename ||
      (request.headers["x-original-name"] as string) ||
      "voice.m4a";
    const ext = path.extname(origName).toLowerCase() || ".m4a";

    const targetDir = safeDataPath("library", "custom", "characters");
    await ensureUploadDirectory(targetDir);

    const finalFileName = `voice_${Date.now()}_${crypto.randomUUID()}${ext}`;
    const finalPath = path.join(targetDir, finalFileName);

    const fileOut = fs.createWriteStream(finalPath);
    let sizeBytes = 0;
    for await (const chunk of request.raw) {
      sizeBytes += (chunk as Buffer).length;
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

    const publicPath = `/media/custom/characters/${finalFileName}`;
    return toJson({ voiceAudioUrl: publicPath });
  },
);


app.post("/api/admin/characters/extract-voice", async (request, reply) => {
  const body = request.body as {
    clips?: Array<{
      mediaUrl: string;
      startSeconds: number;
      durationSeconds: number;
      audioOffsetSeconds?: number;
    }>;
  };

  const clips = Array.isArray(body?.clips) ? body.clips : [];
  if (clips.length === 0) {
    return reply.code(400).send({ error: "Nenhum trecho de áudio fornecido" });
  }

  const targetDir = safeDataPath("library", "custom", "characters");
  await ensureUploadDirectory(targetDir);

  const tempDir = path.join(
    targetDir,
    `tmp_${Date.now()}_${crypto.randomUUID()}`,
  );
  await fs.promises.mkdir(tempDir, { recursive: true });

  const tempClips: string[] = [];

  try {
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      if (!clip.mediaUrl) continue;
      const relative = clip.mediaUrl.replace(/^\/media\//, "");
      const sourceDiskPath = safeDataPath("library", relative);
      const audioInputPath = await resolveAudioSource(sourceDiskPath);
      const clipOutPath = path.join(tempDir, `clip_${i}.m4a`);

      const start = Math.max(
        0,
        (clip.startSeconds || 0) + (clip.audioOffsetSeconds || 0),
      );
      await extractAudioSegment(
        audioInputPath,
        clipOutPath,
        start,
        clip.durationSeconds || 10,
      );
      tempClips.push(clipOutPath);
    }

    if (tempClips.length === 0) {
      return reply.code(400).send({
        error: "Não foi possível extrair nenhum trecho dos vídeos informados",
      });
    }

    const finalFileName = `voice_${Date.now()}_${crypto.randomUUID()}.m4a`;
    const finalPath = path.join(targetDir, finalFileName);

    await concatAudioSegments(tempClips, finalPath);

    const publicPath = `/media/custom/characters/${finalFileName}`;
    return toJson({ voiceAudioUrl: publicPath });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    request.log.error({ err }, "falha ao extrair áudio do personagem");
    return reply.code(400).send({ error: message });
  } finally {
    // cleanup tempDir
    await fs.promises
      .rm(tempDir, { recursive: true, force: true })
      .catch(() => {});
  }
});

}
