import type { FastifyInstance } from "fastify";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "@cyanflix/database";
import { env } from "../lib/config.js";
import { safeDataPath } from "../lib/storage.js";
import { requireActiveProfile } from "../lib/auth-guards.js";
import {
  profileAllowsWork,
  ageRatingFromMetadata,
  readNestedObject,
  readObject,
  readNestedArray,
  profileAllowsItem,
  toJson,
} from "../lib/mappers.js";
import {
  findPlaybackMedia,
  playbackTracks,
  activeEpisodeMedia,
  findNextPlayableEpisode,
  findPlayableSeasonEpisodes,
} from "../services/playback.js";


export async function playbackRoutes(app: FastifyInstance) {
app.get("/api/playback/items/:itemId", async (request, reply) => {
  const profile = await requireActiveProfile(request, reply);
  if (!profile) return;
  const { itemId } = request.params as { itemId: string };
  const work = await prisma.work.findUnique({
    where: { id: itemId },
    include: {
      editorialOverride: true,
      seasons: { select: { metadata: true } },
      mediaObjects: {
        where: {
          kind: "movie_hls",
          publication: {
            state: "confirmed",
            revisions: { some: { active: true } },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (work) {
    if (!profileAllowsWork(profile.maxAgeRating, work))
      return reply.code(404).send({ error: "Item não encontrado" });
    const media = work.mediaObjects[0];
    if (!media?.publicPath)
      return reply.code(404).send({ error: "Mídia do filme não encontrada" });
    const tracks = await playbackTracks(media.publicationId);
    const title = work.editorialOverride?.title ?? work.title;
    return {
      itemType: "movie",
      title,
      originalUrl: media.publicPath,
      delivery:
        readNestedObject(media.codecs, "delivery") ?? readObject(media.codecs),
      markers: readNestedArray(media.codecs, "markers"),
      ...tracks,
      nextEpisode: null,
      fallback: { available: true, status: "not_requested" },
      details: {
        workId: work.id,
        contentKind: work.contentKind,
        title,
        originalTitle: work.originalTitle,
        synopsis: work.editorialOverride?.synopsis ?? work.synopsis,
        year: work.year,
        metadata: {
          ...readObject(work.metadata),
          ...readObject(work.editorialOverride?.metadata),
        },
        season: null,
        episode: null,
        nextEpisode: null,
      },
    };
  }
  const episode = await prisma.episode.findUnique({
    where: { id: itemId },
    include: { work: { include: { editorialOverride: true } }, season: true },
  });
  if (!episode) return reply.code(404).send({ error: "Item não encontrado" });
  if (
    !profileAllowsWork(profile.maxAgeRating, {
      ...episode.work,
      seasons: [episode.season],
    })
  )
    return reply.code(404).send({ error: "Item não encontrado" });
  const media = await activeEpisodeMedia(episode.id, episode.activeRevisionId);
  if (!media?.publicPath)
    return reply.code(404).send({ error: "Mídia do episódio não encontrada" });
  const [tracks, next, episodeNavigation] = await Promise.all([
    playbackTracks(media.publicationId, episode.id),
    findNextPlayableEpisode(
      episode.workId,
      episode.seasonId,
      episode.season.number,
      episode.number,
    ),
    findPlayableSeasonEpisodes(episode.seasonId),
  ]);
  const nextProgress = next
    ? await prisma.viewingProgress.findUnique({
        where: {
          profileId_episodeId: { profileId: profile.id, episodeId: next.id },
        },
      })
    : null;
  const nextDuration = nextProgress?.durationSeconds ?? 0;
  const workTitle = episode.work.editorialOverride?.title ?? episode.work.title;
  return {
    itemType: "episode",
    itemId: episode.id,
    seasonNumber: episode.season.number,
    title: `${workTitle} — ${episode.title ?? `Episódio ${episode.number}`}`,
    originalUrl: media.publicPath,
    delivery: readObject(media.codecs),
    markers: episode.markers,
    ...tracks,
    episodes: episodeNavigation,
    nextEpisode: next
      ? { id: next.id, number: next.number, title: next.title }
      : null,
    fallback: { available: true, status: "not_requested" },
    details: {
      workId: episode.workId,
      contentKind: episode.work.contentKind,
      title: workTitle,
      originalTitle: episode.work.originalTitle,
      synopsis:
        episode.work.editorialOverride?.synopsis ?? episode.work.synopsis,
      year: episode.work.year,
      metadata: {
        ...readObject(episode.work.metadata),
        ...readObject(episode.work.editorialOverride?.metadata),
      },
      season: {
        id: episode.season.id,
        number: episode.season.number,
        title: episode.season.title,
        metadata: episode.season.metadata,
      },
      episode: {
        id: episode.id,
        number: episode.number,
        title: episode.title,
        synopsis: episode.synopsis,
        metadata: episode.metadata,
      },
      nextEpisode: next
        ? {
            id: next.id,
            number: next.number,
            title: next.title,
            synopsis: next.synopsis,
            metadata: next.metadata,
            seasonNumber: next.season.number,
            seasonTitle: next.season.title,
            seasonMetadata: next.season.metadata,
            thumbnail:
              next.assets.find(
                (asset: any) =>
                  asset.publicationId === next.publicationId &&
                  asset.publicPath,
              )?.publicPath ?? null,
            progress: nextProgress
              ? {
                  positionSeconds: nextProgress.positionSeconds,
                  durationSeconds: nextProgress.durationSeconds,
                  completed: nextProgress.completed,
                  progressPercent:
                    nextDuration > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (nextProgress.positionSeconds / nextDuration) * 100,
                          ),
                        )
                      : 0,
                }
              : null,
          }
        : null,
    },
  };
});

app.post("/api/playback/items/:itemId/fallback", async (request, reply) => {
  const profile = await requireActiveProfile(request, reply);
  if (!profile) return;
  const itemId = (request.params as { itemId: string }).itemId;
  if (!(await profileAllowsItem(profile.maxAgeRating, itemId)))
    return reply.code(404).send({ error: "Mídia não encontrada" });
  const media = await findPlaybackMedia(itemId);
  if (!media) return reply.code(404).send({ error: "Mídia não encontrada" });
  const cacheKey = crypto
    .createHash("sha256")
    .update(
      `${media.publicPath}:h264-ladder-v2-timestamps:${env.ffmpegPreset}:${env.ffmpegCrf}`,
    )
    .digest("hex");
  const outputPath = path.join(env.dataRoot, "transcode-cache", cacheKey);
  const sourcePath = safeDataPath(
    "library",
    media.publicPath.replace(/^\/media\//, ""),
  );
  const existing = await prisma.transcodeJob.findUnique({
    where: { cacheKey },
  });
  const job =
    existing?.state === "failed"
      ? await prisma.transcodeJob.update({
          where: { id: existing.id },
          data: { state: "queued", error: null, lastAccessAt: new Date() },
        })
      : await prisma.transcodeJob.upsert({
          where: { cacheKey },
          create: { cacheKey, sourcePath, outputPath, state: "queued" },
          update: { lastAccessAt: new Date() },
        });
  return reply.code(job.state === "finished" ? 200 : 202).send({
    jobId: job.id,
    cacheKey,
    status: job.state,
    adaptive: true,
    url: `/transcode/${cacheKey}/master.m3u8`,
  });
});
app.get("/api/playback/jobs/:jobId", async (request, reply) => {
  if (!(await requireActiveProfile(request, reply))) return;
  const job = await prisma.transcodeJob.findUnique({
    where: { id: (request.params as { jobId: string }).jobId },
  });
  return job
    ? toJson({
        id: job.id,
        status: job.state,
        error: job.error,
        adaptive: true,
        url:
          job.state === "finished"
            ? `/transcode/${job.cacheKey}/master.m3u8`
            : undefined,
      })
    : reply.code(404).send({ error: "Job não encontrado" });
});

}
