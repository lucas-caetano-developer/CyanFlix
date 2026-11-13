import type { FastifyInstance } from "fastify";
import { prisma } from "@cyanflix/database";
import { auth, profileUnlockAttempts } from "../lib/config.js";
import { hashPassword, verifyPassword } from "../auth.js";
import {
  sessionIdentity,
  requireOwnedProfile,
  requireActiveProfile,
  requireActiveOwnedProfile,
} from "../lib/auth-guards.js";
import {
  toProfileDto,
  profilePublicSelect,
  parseProfileControls,
  toWorkCardDto,
  profileAllowsItem,
  workRatingSummary,
  workCardInclude,
  profileAllowsWork,
  toJson,
  readObject,
  jsonValue,
} from "../lib/mappers.js";
import { findNextPlayableEpisode } from "../services/playback.js";

export async function profileRoutes(app: FastifyInstance) {
app.get("/api/profiles", async (request) => {
  const profiles = await prisma.profile.findMany({
    where: { accountId: sessionIdentity(request).accountId },
    orderBy: { createdAt: "asc" },
    select: profilePublicSelect,
  });
  return profiles.map(toProfileDto);
});
app.post("/api/profiles", async (request, reply) => {
  const body = request.body as {
    name?: string;
    avatar?: string;
    pin?: unknown;
    maxAgeRating?: unknown;
  };
  if (!body?.name?.trim())
    return reply.code(400).send({ error: "Nome obrigatório" });
  const controls = await parseProfileControls(body, reply);
  if (!controls) return;
  const identity = sessionIdentity(request);
  const existingCount = await prisma.profile.count({
    where: { accountId: identity.accountId },
  });
  const role =
    existingCount === 0 &&
    (identity.role === "owner" || identity.role === "admin")
      ? "admin"
      : "viewer";
  const profile = await prisma.profile.create({
    data: {
      accountId: identity.accountId,
      name: body.name.trim(),
      avatar: body.avatar ?? "cyan",
      role,
      ...controls,
    },
    select: profilePublicSelect,
  });
  if (!controls.pinHash) {
    auth.setProfileSession(reply, identity, profile.id);
  }
  return toProfileDto(profile);
});
app.get("/api/profiles/avatars", async () => {
  const characters = await prisma.character.findMany({
    where: { photoUrl: { not: null } },
    select: {
      id: true,
      name: true,
      photoUrl: true,
      works: {
        select: { id: true, title: true },
        orderBy: { title: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const groupMap = new Map<
    string,
    {
      id: string;
      title: string;
      characters: Array<{ id: string; name: string; photoUrl: string }>;
    }
  >();

  for (const char of characters) {
    if (!char.photoUrl) continue;
    if (!char.works || char.works.length === 0) {
      const defaultGroup = groupMap.get("__cyanflix__") || {
        id: "cyanflix",
        title: "CyanFlix",
        characters: [],
      };
      defaultGroup.characters.push({
        id: char.id,
        name: char.name,
        photoUrl: char.photoUrl,
      });
      groupMap.set("__cyanflix__", defaultGroup);
    } else {
      for (const work of char.works) {
        let group = groupMap.get(work.id);
        if (!group) {
          group = { id: work.id, title: work.title, characters: [] };
          groupMap.set(work.id, group);
        }
        if (!group.characters.some((c) => c.id === char.id)) {
          group.characters.push({
            id: char.id,
            name: char.name,
            photoUrl: char.photoUrl,
          });
        }
      }
    }
  }

  return toJson(Array.from(groupMap.values()));
});
app.patch("/api/profiles/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as {
    name?: string;
    avatar?: string;
    pin?: unknown;
    maxAgeRating?: unknown;
  };
  if (!body?.name?.trim())
    return reply.code(400).send({ error: "Nome obrigatório" });
  await requireOwnedProfile(request, id, reply);
  if (reply.sent) return;
  const controls = await parseProfileControls(body, reply, true);
  if (!controls) return;
  const profile = await prisma.profile.update({
    where: { id },
    data: { name: body.name.trim(), avatar: body.avatar, ...controls },
    select: profilePublicSelect,
  });
  return toProfileDto(profile);
});
app.delete("/api/profiles/:id", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  await requireOwnedProfile(request, id, reply);
  if (reply.sent) return;
  await prisma.profile.delete({ where: { id } });
  return reply.code(204).send();
});
app.post("/api/profiles/:id/unlock", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const identity = sessionIdentity(request);
  const key = `${request.ip}:${id}`;
  const now = Date.now();
  const attempt = profileUnlockAttempts.get(key);
  if (attempt && attempt.resetAt > now && attempt.count >= 5)
    return reply
      .code(429)
      .send({ error: "Muitas tentativas; aguarde alguns minutos" });
  const profile = await prisma.profile.findFirst({
    where: { id, accountId: identity.accountId },
    select: profilePublicSelect,
  });
  if (!profile) return reply.code(404).send({ error: "Perfil não encontrado" });
  const pin = String((request.body as { pin?: unknown } | null)?.pin ?? "");
  if (profile.pinHash && !(await verifyPassword(pin, profile.pinHash))) {
    profileUnlockAttempts.set(key, {
      count: attempt && attempt.resetAt > now ? attempt.count + 1 : 1,
      resetAt: now + 5 * 60_000,
    });
    return reply.code(401).send({ error: "PIN inválido" });
  }
  profileUnlockAttempts.delete(key);
  auth.setProfileSession(reply, identity, profile.id);
  return toProfileDto(profile);
});
app.get("/api/profiles/active", async (request, reply) => {
  const active = auth.profile(request);
  if (!active) return reply.code(401).send({ error: "Selecione um perfil" });
  const profile = await prisma.profile.findFirst({
    where: { id: active.profileId, accountId: active.accountId },
    select: profilePublicSelect,
  });
  return profile
    ? toProfileDto(profile)
    : reply.code(401).send({ error: "Perfil indisponível" });
});
app.get("/api/profiles/:id/preferences", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  await requireActiveOwnedProfile(request, id, reply);
  if (reply.sent) return;
  const profile = await prisma.profile.findUnique({
    where: { id },
    select: { preferences: true },
  });
  const stored = readObject(profile?.preferences);
  return {
    autoplayNextEpisode: stored.autoplayNextEpisode !== false,
    subtitleStyle: ["small", "medium", "large"].includes(
      String(stored.subtitleStyle),
    )
      ? stored.subtitleStyle
      : "medium",
  };
});
app.patch("/api/profiles/:id/preferences", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  await requireActiveOwnedProfile(request, id, reply);
  if (reply.sent) return;
  const body = request.body as {
    autoplayNextEpisode?: unknown;
    subtitleStyle?: unknown;
  };
  if (
    body.autoplayNextEpisode !== undefined &&
    typeof body.autoplayNextEpisode !== "boolean"
  )
    return reply.code(400).send({ error: "Preferência de autoplay inválida" });
  if (
    body.subtitleStyle !== undefined &&
    !["small", "medium", "large"].includes(String(body.subtitleStyle))
  )
    return reply.code(400).send({ error: "Estilo de legenda inválido" });
  const current = await prisma.profile.findUnique({
    where: { id },
    select: { preferences: true },
  });
  const preferences = {
    ...readObject(current?.preferences),
    ...(typeof body.autoplayNextEpisode === "boolean"
      ? { autoplayNextEpisode: body.autoplayNextEpisode }
      : {}),
    ...(body.subtitleStyle ? { subtitleStyle: body.subtitleStyle } : {}),
  };
  await prisma.profile.update({
    where: { id },
    data: { preferences: jsonValue(preferences) },
  });
  return {
    autoplayNextEpisode: preferences.autoplayNextEpisode !== false,
    subtitleStyle: preferences.subtitleStyle ?? "medium",
  };
});

const workPresentationAssetTypes = [
  "poster",
  "poster_card",
  "poster-card",
  "backdrop",
  "backdrop_card",
  "backdrop-card",
  "hero",
  "logo",
  "logo_webp",
  "trailer",
  "motion_preview",
];
const seasonPresentationAssetTypes = [
  "poster",
  "poster_card",
  "poster-card",
  "trailer",
  "motion_preview",
  "season_presentation",
];
const episodePresentationAssetTypes = [
  "episode_thumbnail",
  "thumbnail",
  "thumbnail_webp",
];

app.get("/api/profiles/:profileId/favorites", async (request, reply) => {
  const profileId = (request.params as { profileId: string }).profileId;
  const profile = await requireActiveOwnedProfile(request, profileId, reply);
  if (!profile) return;
  const rows = await prisma.favorite.findMany({
    where: { profileId },
    orderBy: { createdAt: "desc" },
    include: { work: { include: workCardInclude } },
  });
  return toJson(
    rows
      .map((row) => row.work)
      .filter(
        (work) =>
          !work.hidden &&
          work.editorialOverride?.hidden !== true &&
          profileAllowsWork(profile.maxAgeRating, work),
      )
      .map(toWorkCardDto),
  );
});
app.get("/api/profiles/:profileId/ratings/:workId", async (request, reply) => {
  const { profileId, workId } = request.params as {
    profileId: string;
    workId: string;
  };
  const profile = await requireActiveOwnedProfile(request, profileId, reply);
  if (!profile) return;
  if (!(await profileAllowsItem(profile.maxAgeRating, workId)))
    return reply.code(404).send({ error: "Obra não encontrada" });
  return workRatingSummary(profileId, workId);
});
app.put("/api/profiles/:profileId/ratings/:workId", async (request, reply) => {
  const { profileId, workId } = request.params as {
    profileId: string;
    workId: string;
  };
  const profile = await requireActiveOwnedProfile(request, profileId, reply);
  if (!profile) return;
  if (!(await profileAllowsItem(profile.maxAgeRating, workId)))
    return reply.code(404).send({ error: "Obra não encontrada" });
  const value = (request.body as { value?: unknown } | null)?.value;
  if (value !== 1 && value !== -1 && value !== 0)
    return reply.code(400).send({ error: "Avaliação inválida" });
  if (value === 0)
    await prisma.workRating.deleteMany({ where: { profileId, workId } });
  else
    await prisma.workRating.upsert({
      where: { profileId_workId: { profileId, workId } },
      create: { profileId, workId, value },
      update: { value },
    });
  return workRatingSummary(profileId, workId);
});
app.put("/api/profiles/:profileId/progress/:itemId", async (request, reply) => {
  const { profileId, itemId } = request.params as {
    profileId: string;
    itemId: string;
  };
  const profile = await requireActiveOwnedProfile(request, profileId, reply);
  if (!profile) return;
  if (!(await profileAllowsItem(profile.maxAgeRating, itemId)))
    return reply.code(404).send({ error: "Item não encontrado" });
  const body = request.body as {
    positionSeconds?: number;
    durationSeconds?: number;
  };
  const positionSeconds = Math.max(
    0,
    Math.floor(Number(body?.positionSeconds)),
  );
  const durationSeconds =
    body?.durationSeconds == null
      ? null
      : Math.max(0, Math.floor(Number(body.durationSeconds)));
  if (
    !Number.isFinite(positionSeconds) ||
    (durationSeconds !== null && !Number.isFinite(durationSeconds))
  )
    return reply.code(400).send({ error: "Progresso inválido" });
  const completed = Boolean(
    durationSeconds && positionSeconds / durationSeconds >= 0.9,
  );
  const [work, episode] = await Promise.all([
    prisma.work.findUnique({ where: { id: itemId }, select: { id: true } }),
    prisma.episode.findUnique({ where: { id: itemId }, select: { id: true } }),
  ]);
  if (!work && !episode)
    return reply.code(404).send({ error: "Item não encontrado" });
  if (work)
    await prisma.viewingProgress.upsert({
      where: { profileId_workId: { profileId, workId: work.id } },
      create: {
        profileId,
        workId: work.id,
        positionSeconds,
        durationSeconds,
        completed,
      },
      update: { positionSeconds, durationSeconds, completed },
    });
  else
    await prisma.viewingProgress.upsert({
      where: { profileId_episodeId: { profileId, episodeId: episode!.id } },
      create: {
        profileId,
        episodeId: episode!.id,
        positionSeconds,
        durationSeconds,
        completed,
      },
      update: { positionSeconds, durationSeconds, completed },
    });
  return reply.code(204).send();
});
app.get("/api/profiles/:profileId/progress/:itemId", async (request, reply) => {
  const { profileId, itemId } = request.params as {
    profileId: string;
    itemId: string;
  };
  await requireActiveOwnedProfile(request, profileId, reply);
  if (reply.sent) return;
  const row = await prisma.viewingProgress.findFirst({
    where: { profileId, OR: [{ workId: itemId }, { episodeId: itemId }] },
  });
  return row
    ? toJson(row)
    : { positionSeconds: 0, durationSeconds: null, completed: false };
});
app.get(
  "/api/profiles/:profileId/continue-watching",
  async (request, reply) => {
    const profileId = (request.params as { profileId: string }).profileId;
    const profile = await requireActiveOwnedProfile(request, profileId, reply);
    if (!profile) return;
    const rows = await prisma.viewingProgress.findMany({
      where: { profileId, completed: false, positionSeconds: { gt: 0 } },
      orderBy: { updatedAt: "desc" },
      include: {
        work: { include: workCardInclude },
        episode: {
          include: {
            work: { include: workCardInclude },
            season: { select: { number: true } },
          },
        },
      },
      take: 30,
    });
    const seen = new Set<string>();
    return toJson(
      rows.flatMap((row) => {
        const work = row.work ?? row.episode?.work;
        if (
          !work ||
          work.hidden ||
          work.editorialOverride?.hidden === true ||
          !profileAllowsWork(profile.maxAgeRating, work) ||
          seen.has(work.id)
        )
          return [];
        seen.add(work.id);
        const duration = row.durationSeconds ?? 0;
        return [
          {
            ...toWorkCardDto(work),
            continueWatching: {
              itemId: row.episode?.id ?? work.id,
              itemType: row.episode ? "episode" : "movie",
              episodeNumber: row.episode?.number ?? null,
              episodeTitle: row.episode?.title ?? null,
              seasonNumber: row.episode?.season.number ?? null,
              positionSeconds: row.positionSeconds,
              durationSeconds: row.durationSeconds,
              progressPercent:
                duration > 0
                  ? Math.min(
                      100,
                      Math.round((row.positionSeconds / duration) * 100),
                    )
                  : 0,
              updatedAt: row.updatedAt,
            },
          },
        ];
      }),
    );
  },
);
app.get("/api/profiles/:profileId/up-next", async (request, reply) => {
  const profileId = (request.params as { profileId: string }).profileId;
  const profile = await requireActiveOwnedProfile(request, profileId, reply);
  if (!profile) return;
  const [completed, inProgress] = await Promise.all([
    prisma.viewingProgress.findMany({
      where: { profileId, completed: true, episodeId: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: {
        episode: {
          include: { season: { select: { id: true, number: true } } },
        },
      },
    }),
    prisma.viewingProgress.findMany({
      where: {
        profileId,
        completed: false,
        positionSeconds: { gt: 0 },
        episodeId: { not: null },
      },
      select: { episodeId: true },
    }),
  ]);
  const inProgressEpisodes = new Set(
    inProgress
      .map((progress) => progress.episodeId)
      .filter((id): id is string => Boolean(id)),
  );
  const output: Array<
    ReturnType<typeof toWorkCardDto> & {
      continueWatching: Record<string, unknown>;
    }
  > = [];
  const seenWorks = new Set<string>();
  for (const progress of completed) {
    const episode = progress.episode;
    if (!episode || seenWorks.has(episode.workId)) continue;
    seenWorks.add(episode.workId);
    const next = await findNextPlayableEpisode(
      episode.workId,
      episode.seasonId,
      episode.season.number,
      episode.number,
    );
    if (!next || inProgressEpisodes.has(next.id)) continue;
    const work = await prisma.work.findUnique({
      where: { id: episode.workId },
      include: workCardInclude,
    });
    if (
      !work ||
      work.hidden ||
      work.editorialOverride?.hidden === true ||
      !profileAllowsWork(profile.maxAgeRating, work)
    )
      continue;
    output.push({
      ...toWorkCardDto(work),
      continueWatching: {
        itemId: next.id,
        itemType: "episode",
        episodeNumber: next.number,
        episodeTitle: next.title,
        seasonNumber: next.season.number,
        positionSeconds: 0,
        durationSeconds: null,
        progressPercent: 0,
        updatedAt: progress.updatedAt,
      },
    });
    if (output.length >= 12) break;
  }
  return toJson(output);
});

}
