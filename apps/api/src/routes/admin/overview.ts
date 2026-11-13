import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import { prisma } from "@cyanflix/database";
import { safeDataPath } from "../../lib/storage.js";
import { env } from "../../lib/config.js";
import { readAdminEventSnapshot, type AdminEventSnapshot } from "../../services/events.js";
import { sessionIdentity } from "../../lib/auth-guards.js";
import { toJson } from "../../lib/mappers.js";

export async function adminOverviewRoutes(app: FastifyInstance) {
app.get("/api/admin/events", async (request, reply) => {
  const identity = sessionIdentity(request);
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  reply.raw.flushHeaders();

  let closed = false;
  let running = false;
  let previous: AdminEventSnapshot | null = null;
  let lastIdentityCheck = Date.now();

  const sendSnapshot = async () => {
    if (closed || running) return;
    running = true;
    try {
      if (Date.now() - lastIdentityCheck >= 30_000) {
        lastIdentityCheck = Date.now();
        const account = await prisma.account.findFirst({
          where: {
            id: identity.accountId,
            disabled: false,
            role: { in: ["owner", "admin"] },
          },
          select: { id: true },
        });
        if (!account) {
          reply.raw.end();
          return;
        }
      }
      const snapshot = await readAdminEventSnapshot();
      const changed = previous
        ? (Object.keys(snapshot) as Array<keyof AdminEventSnapshot>).filter(
            (key) => snapshot[key] !== (previous as any)[key],
          )
        : Object.keys(snapshot);
      if (changed.length) {
        reply.raw.write(
          `event: operations\ndata: ${JSON.stringify({ changed, snapshot, at: new Date().toISOString() })}\n\n`,
        );
        previous = snapshot;
      }
    } catch (error) {
      request.log.error({ err: error }, "admin event stream refresh failed");
      reply.raw.write(
        `event: stream-error\ndata: ${JSON.stringify({ error: "refresh_failed" })}\n\n`,
      );
    } finally {
      running = false;
    }
  };

  await sendSnapshot();
  const refreshTimer = setInterval(() => {
    void sendSnapshot();
  }, 2_000);
  const heartbeatTimer = setInterval(() => {
    if (!closed) reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
  }, 15_000);
  reply.raw.once("close", () => {
    closed = true;
    clearInterval(refreshTimer);
    clearInterval(heartbeatTimer);
  });
});

app.get("/api/admin/dashboard", async () => {
  const now = new Date();
  const [
    works,
    seasons,
    episodes,
    publications,
    transcodes,
    publicationProcessing,
    publicationRetrying,
    publicationFailed,
    transcodeQueued,
    transcodeFailed,
  ] = await Promise.all([
    prisma.work.count(),
    prisma.season.count(),
    prisma.episode.count(),
    prisma.publication.count(),
    prisma.transcodeJob.count(),
    prisma.publication.count({
      where: {
        state: { in: ["validating", "promoting"] },
        finalizationLeaseUntil: { gt: now },
      },
    }),
    prisma.publication.count({
      where: {
        state: { in: ["validating", "promoting"] },
        finalizationNextAttemptAt: { gt: now },
      },
    }),
    prisma.publication.count({ where: { state: "failed" } }),
    prisma.transcodeJob.count({
      where: { state: { in: ["queued", "processing"] } },
    }),
    prisma.transcodeJob.count({ where: { state: "failed" } }),
  ]);
  return {
    works,
    seasons,
    episodes,
    publications,
    transcodes,
    publicationProcessing,
    publicationRetrying,
    publicationFailed,
    transcodeQueued,
    transcodeFailed,
  };
});
app.get("/api/admin/storage", async () => {
  const [assets, media, publications, transcodes, disk] = await Promise.all([
    prisma.asset.aggregate({
      _sum: { sizeBytes: true },
      _count: { _all: true },
    }),
    prisma.mediaObject.aggregate({
      _sum: { sizeBytes: true },
      _count: { _all: true },
    }),
    prisma.publication.aggregate({
      _sum: { totalSizeBytes: true },
      _count: { _all: true },
    }),
    prisma.transcodeJob.aggregate({
      _sum: { sizeBytes: true },
      _count: { _all: true },
    }),
    fs.promises
      .statfs(env.dataRoot)
      .then((value) => ({
        totalBytes: Number(value.blocks) * Number(value.bsize),
        freeBytes: Number(value.bavail) * Number(value.bsize),
      }))
      .catch(() => null),
  ]);
  return toJson({
    assets: { count: assets._count._all, bytes: assets._sum.sizeBytes ?? 0n },
    media: { count: media._count._all, bytes: media._sum.sizeBytes ?? 0n },
    publications: {
      count: publications._count._all,
      bytes: publications._sum.totalSizeBytes ?? 0n,
    },
    transcodeCache: {
      count: transcodes._count._all,
      bytes: transcodes._sum.sizeBytes ?? 0n,
    },
    disk,
  });
});

app.get("/api/admin/audit", async (request) => {
  const query = request.query as { targetId?: string };
  return toJson(
    await prisma.auditLog.findMany({
      where: query.targetId ? { targetId: query.targetId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { actor: { select: { username: true, role: true } } },
    }),
  );
});
}
