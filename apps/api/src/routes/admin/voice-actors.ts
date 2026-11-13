import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@cyanflix/database";
import { toJson } from "../../lib/mappers.js";
import { safeDataPath, ensureUploadDirectory } from "../../lib/storage.js";

export async function adminVoiceActorsRoutes(app: FastifyInstance) {
app.get("/api/admin/voice-actors", async (request) => {
  const query = request.query as { q?: string };
  const q = String(query.q ?? "")
    .trim()
    .slice(0, 200);
  const actors = await prisma.voiceActor.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: {
      _count: { select: { characters: true } },
    },
    orderBy: { name: "asc" },
  });
  return toJson(actors);
});

app.post("/api/admin/voice-actors", async (request, reply) => {
  const body = request.body as {
    name?: string;
    photoUrl?: string;
    bio?: string;
  };
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name)
    return reply.code(400).send({ error: "Nome do dublador é obrigatório" });
  if (name.length > 200)
    return reply.code(400).send({ error: "Nome excede 200 caracteres" });

  const photoUrl =
    typeof body.photoUrl === "string" && body.photoUrl.trim()
      ? body.photoUrl.trim()
      : null;
  const bio =
    typeof body.bio === "string" && body.bio.trim() ? body.bio.trim() : null;

  const actor = await prisma.voiceActor.create({
    data: {
      name,
      photoUrl,
      bio,
    },
    include: {
      _count: { select: { characters: true } },
    },
  });
  return reply.code(201).send(toJson(actor));
});

app.get("/api/admin/voice-actors/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const actor = await prisma.voiceActor.findUnique({
    where: { id },
    include: {
      characters: {
        include: {
          works: {
            select: { id: true, title: true, contentKind: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!actor) return reply.code(404).send({ error: "Dublador não encontrado" });
  return toJson({
    ...actor,
    characters: actor.characters.map((c) => ({
      ...c,
      workId: c.works[0]?.id || "",
      work: c.works[0] || null,
    })),
  });
});

app.patch("/api/admin/voice-actors/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as {
    name?: string;
    photoUrl?: string | null;
    bio?: string | null;
  };

  const actor = await prisma.voiceActor.findUnique({ where: { id } });
  if (!actor) return reply.code(404).send({ error: "Dublador não encontrado" });

  const data: Prisma.VoiceActorUpdateInput = {};
  if (body.name !== undefined) {
    const cleanName = typeof body.name === "string" ? body.name.trim() : "";
    if (!cleanName)
      return reply
        .code(400)
        .send({ error: "Nome do dublador não pode ser vazio" });
    data.name = cleanName;
  }
  if (body.photoUrl !== undefined) {
    data.photoUrl =
      typeof body.photoUrl === "string" && body.photoUrl.trim()
        ? body.photoUrl.trim()
        : null;
  }
  if (body.bio !== undefined) {
    data.bio =
      typeof body.bio === "string" && body.bio.trim() ? body.bio.trim() : null;
  }

  const updated = await prisma.voiceActor.update({
    where: { id },
    data,
    include: {
      _count: { select: { characters: true } },
    },
  });
  return toJson(updated);
});

app.delete("/api/admin/voice-actors/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const actor = await prisma.voiceActor.findUnique({ where: { id } });
  if (!actor) return reply.code(404).send({ error: "Dublador não encontrado" });

  await prisma.voiceActor.delete({ where: { id } });
  return reply.code(204).send();
});

app.post(
  "/api/admin/voice-actors/upload-photo",
  { bodyLimit: 25 * 1024 * 1024 },
  async (request, reply) => {
    const query = request.query as { filename?: string };
    const origName =
      query.filename ||
      (request.headers["x-original-name"] as string) ||
      "photo.webp";
    const ext = path.extname(origName).toLowerCase() || ".webp";

    const targetDir = safeDataPath("library", "custom", "voice-actors");
    await ensureUploadDirectory(targetDir);

    const finalFileName = `actor_${Date.now()}_${crypto.randomUUID()}${ext}`;
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

    const publicPath = `/media/custom/voice-actors/${finalFileName}`;
    return toJson({ photoUrl: publicPath });
  },
);

/* ==========================================================================
   Characters (Personagens) Theme Colors & Palette
   ========================================================================== */
}
