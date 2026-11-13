import { prisma } from "@cyanflix/database";
import { profileAllowsWork, episodePresentationAssetTypes } from "../lib/mappers.js";

export async function findPlaybackMedia(
  itemId: string,
): Promise<{ publicPath: string } | null> {
  const work = await prisma.work.findUnique({
    where: { id: itemId },
    include: {
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
  if (work?.mediaObjects[0]?.publicPath)
    return { publicPath: work.mediaObjects[0].publicPath };
  const episode = await prisma.episode.findUnique({
    where: { id: itemId },
    select: { id: true, activeRevisionId: true },
  });
  const media = episode
    ? await activeEpisodeMedia(episode.id, episode.activeRevisionId)
    : null;
  return media?.publicPath ? { publicPath: media.publicPath } : null;
}
export async function activeEpisodeMedia(
  episodeId: string,
  activeRevisionId: string | null,
) {
  if (!activeRevisionId) return null;
  const revision = await prisma.revision.findUnique({
    where: { id: activeRevisionId },
    select: { publicationId: true },
  });
  if (!revision) return null;
  return prisma.mediaObject.findFirst({
    where: {
      episodeId,
      publicationId: revision.publicationId,
      kind: "episode_hls",
      publication: { state: "confirmed" },
    },
    orderBy: { createdAt: "desc" },
  });
}
export async function findNextPlayableEpisode(
  workId: string,
  seasonId: string,
  seasonNumber: number,
  episodeNumber: number,
) {
  const candidates = await prisma.episode.findMany({
    where: {
      workId,
      hidden: false,
      activeRevisionId: { not: null },
      season: { hidden: false },
      OR: [
        { seasonId, number: { gt: episodeNumber } },
        { season: { number: { gt: seasonNumber } } },
      ],
    },
    include: {
      season: {
        select: { id: true, number: true, title: true, metadata: true },
      },
      assets: {
        where: {
          type: { in: episodePresentationAssetTypes },
          publication: { state: "confirmed" },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          publicPath: true,
          metadata: true,
          publicationId: true,
        },
      },
    },
    orderBy: [{ season: { number: "asc" } }, { number: "asc" }],
  });
  if (!candidates.length) return null;
  const revisionIds = candidates
    .map((candidate) => candidate.activeRevisionId)
    .filter((id): id is string => Boolean(id));
  const revisions = await prisma.revision.findMany({
    where: { id: { in: revisionIds } },
    select: { id: true, publicationId: true },
  });
  const publicationByRevision = new Map(
    revisions.map((revision) => [revision.id, revision.publicationId]),
  );
  const media = await prisma.mediaObject.findMany({
    where: {
      episodeId: { in: candidates.map((candidate) => candidate.id) },
      kind: "episode_hls",
      publication: { state: "confirmed" },
    },
    select: { episodeId: true, publicationId: true },
  });
  const available = new Set(
    media.map((item) => `${item.episodeId}:${item.publicationId}`),
  );
  const selected =
    candidates.find((candidate) => {
      const publicationId = candidate.activeRevisionId
        ? publicationByRevision.get(candidate.activeRevisionId)
        : undefined;
      return Boolean(
        publicationId && available.has(`${candidate.id}:${publicationId}`),
      );
    }) ?? null;
  if (!selected) return null;
  return {
    ...selected,
    publicationId: selected.activeRevisionId
      ? (publicationByRevision.get(selected.activeRevisionId) ?? null)
      : null,
  };
}
export async function findPlayableSeasonEpisodes(seasonId: string) {
  const candidates = await prisma.episode.findMany({
    where: { seasonId, hidden: false, activeRevisionId: { not: null } },
    orderBy: { number: "asc" },
    select: { id: true, number: true, title: true, activeRevisionId: true },
  });
  if (!candidates.length) return [];
  const revisionIds = candidates
    .map((episode) => episode.activeRevisionId)
    .filter((id): id is string => Boolean(id));
  const revisions = await prisma.revision.findMany({
    where: { id: { in: revisionIds } },
    select: { id: true, publicationId: true },
  });
  const publicationByRevision = new Map(
    revisions.map((revision) => [revision.id, revision.publicationId]),
  );
  const media = await prisma.mediaObject.findMany({
    where: {
      episodeId: { in: candidates.map((episode) => episode.id) },
      kind: "episode_hls",
      publication: { state: "confirmed" },
    },
    select: { episodeId: true, publicationId: true },
  });
  const playable = new Set(
    media.map((item) => `${item.episodeId}:${item.publicationId}`),
  );
  return candidates
    .filter((episode) => {
      const publicationId = episode.activeRevisionId
        ? publicationByRevision.get(episode.activeRevisionId)
        : undefined;
      return Boolean(
        publicationId && playable.has(`${episode.id}:${publicationId}`),
      );
    })
    .map(({ id, number, title }) => ({ id, number, title }));
}
export async function playbackTracks(
  publicationId: string | null,
  episodeId?: string,
) {
  if (!publicationId) return { subtitles: [], audioTracks: [] };
  const assets = await prisma.asset.findMany({
    where: {
      publicationId,
      ...(episodeId ? { episodeId } : {}),
      type: { in: ["subtitle_vtt", "audio_hls"] },
    },
    orderBy: { relativePath: "asc" },
  });
  return {
    subtitles: assets
      .filter((asset) => asset.type === "subtitle_vtt")
      .map((asset) => ({ url: asset.publicPath, metadata: asset.metadata })),
    audioTracks: assets
      .filter((asset) => asset.type === "audio_hls")
      .map((asset) => ({ url: asset.publicPath, metadata: asset.metadata })),
  };
}
class UploadConflict extends Error {}
