import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import crypto from "node:crypto";
import { Prisma, PublicationState } from "@prisma/client";
import { prisma, ensureDefaultProfile, findRevisionCleanupCandidates } from "@cyanflix/database";
import { readEnv } from "@cyanflix/shared";
import { isSafeRelativePath, manifestHash, manifestSchema, type PackageManifest } from "@cyanflix/contracts";
import { createAuth, hashPassword, verifyPassword } from "./auth.js";

const env = readEnv();
const auth = createAuth(env);
const app = Fastify({ logger: true, trustProxy: process.env.TRUST_PROXY === "true", bodyLimit: Number(process.env.API_BODY_LIMIT_BYTES ?? 2 * 1024 * 1024) });
const allowedOrigin = new URL(env.appUrl).origin;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const profileUnlockAttempts = new Map<string, { count: number; resetAt: number }>();
const requestSessions = new WeakMap<FastifyRequest, { accountId: string; role: "owner" | "admin" | "viewer" }>();
const activeUploads = new Set<string>();
const activeWorkDeletions = new Set<string>();
// HLS packages contain hundreds of sibling segments.  Cache directory creation
// per API process so every segment does not contend on the Docker volume's
// directory metadata before its actual stream can be written.
const uploadDirectories = new Map<string, Promise<void>>();

await app.register(cors, { origin: allowedOrigin, credentials: true });
app.addContentTypeParser("application/octet-stream", (_request, payload, done) => done(null, payload));

app.addHook("onRequest", async (request, reply) => {
  const pathname = request.url.split("?", 1)[0];
  if (pathname === "/health" || pathname === "/api/health" || pathname === "/api/auth/login" || pathname === "/v1/auth/token") return;
  if (pathname.startsWith("/v1/")) {
    const identity = auth.session(request);
    if (identity) {
      const account = await prisma.account.findFirst({ where: { id: identity.accountId, disabled: false, role: { in: ["owner", "admin"] } }, select: { id: true } });
      if (!account) return reply.code(403).send({ error: "Publisher access required" });
    } else if (!auth.canPublish(request)) return reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  if (pathname.startsWith("/api/")) {
    let tokenIdentity = auth.session(request);
    if (!tokenIdentity) {
      // Entrada livre: não há tela de login. Cria uma sessão implícita para a
      // conta do sistema (owner), criada no bootstrap, de modo que perfis e
      // catálogo estejam disponíveis sem exigir credenciais do usuário.
      tokenIdentity = { accountId: bootstrapAccount.id, role: bootstrapAccount.role };
      auth.setSession(reply, tokenIdentity);
    }
    const account = await prisma.account.findFirst({ where: { id: tokenIdentity.accountId, disabled: false }, select: { id: true, role: true } });
    if (!account) { auth.clearSession(reply); return reply.code(401).send({ error: "Authentication required" }); }
    const identity = { accountId: account.id, role: account.role };
    requestSessions.set(request, identity);
    if (pathname.startsWith("/api/admin/") && identity.role !== "owner" && identity.role !== "admin") {
      return reply.code(403).send({ error: "Administrator access required" });
    }
  }
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.origin;
    if (origin && origin !== allowedOrigin) return reply.code(403).send({ error: "Invalid origin" });
  }
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "request failed");
  const status = typeof error.statusCode === "number" && error.statusCode >= 400 ? error.statusCode : 500;
  reply.code(status).send({ error: status === 500 ? "Internal server error" : error.message });
});

app.get("/health", async () => ({ ok: true, service: "cyanflix-api" }));
app.get("/api/health", async () => ({ ok: true, service: "cyanflix-api" }));

app.post("/api/auth/login", async (request, reply) => {
  const body = request.body as { username?: string; password?: string };
  const now = Date.now();
  const attempt = loginAttempts.get(request.ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 5) return reply.code(429).send({ error: "Muitas tentativas; aguarde alguns minutos" });
  const username = normalizeUsername(body?.username ?? "owner");
  const account = username ? await prisma.account.findUnique({ where: { username } }) : null;
  if (!body?.password || !account || account.disabled || !await verifyPassword(body.password, account.passwordHash)) {
    loginAttempts.set(request.ip, { count: attempt && attempt.resetAt > now ? attempt.count + 1 : 1, resetAt: now + 5 * 60_000 });
    return reply.code(401).send({ error: "Credenciais inválidas" });
  }
  loginAttempts.delete(request.ip);
  auth.setSession(reply, { accountId: account.id, role: account.role });
  return { authenticated: true, accountId: account.id, username: account.username, role: account.role };
});
app.post("/api/auth/logout", async (_request, reply) => { auth.clearSession(reply); return reply.code(204).send(); });
app.get("/api/auth/session", async (request, reply) => {
  const identity = sessionIdentity(request);
  const account = await prisma.account.findFirst({ where: { id: identity.accountId, disabled: false }, select: { id: true, username: true, role: true } });
  if (!account) { auth.clearSession(reply); return reply.code(401).send({ error: "Session account unavailable" }); }
  return { authenticated: true, accountId: account.id, username: account.username, role: account.role };
});
app.get("/api/auth/verify", async (request, reply) => {
  const originalUri = String(request.headers["x-original-uri"] ?? "");
  const cacheKey = originalUri.match(/^\/transcode\/([a-f0-9]{64})(?:\/|$)/)?.[1];
  if (cacheKey) {
    const now = new Date();
    void prisma.transcodeJob.updateMany({
      where: { cacheKey, state: "finished" },
      data: { lastAccessAt: now, protectedUntil: new Date(now.getTime() + 10 * 60_000) },
    }).catch((error) => request.log.error({ err: error, cacheKey }, "failed to protect active transcode cache"));
  }
  return reply.code(204).send();
});

app.post("/v1/auth/token", async (request, reply) => {
  const header = request.headers.authorization;
  const candidate = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!auth.matchesSecret(candidate, env.publisherToken)) return reply.code(401).send({ error: "Unauthorized" });
  return auth.publisherAccessToken();
});

const profilePublicSelect = { id: true, name: true, avatar: true, role: true, preferences: true, maxAgeRating: true, createdAt: true, updatedAt: true, pinHash: true } as const;
app.get("/api/profiles", async (request) => {
  const profiles = await prisma.profile.findMany({ where: { accountId: sessionIdentity(request).accountId }, orderBy: { createdAt: "asc" }, select: profilePublicSelect });
  return profiles.map(toProfileDto);
});
app.post("/api/profiles", async (request, reply) => {
  const body = request.body as { name?: string; avatar?: string; pin?: unknown; maxAgeRating?: unknown };
  if (!body?.name?.trim()) return reply.code(400).send({ error: "Nome obrigatório" });
  const controls = await parseProfileControls(body, reply);
  if (!controls) return;
  const profile = await prisma.profile.create({ data: { accountId: sessionIdentity(request).accountId, name: body.name.trim(), avatar: body.avatar ?? "cyan", role: "viewer", ...controls }, select: profilePublicSelect });
  return toProfileDto(profile);
});
app.patch("/api/profiles/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as { name?: string; avatar?: string; pin?: unknown; maxAgeRating?: unknown };
  if (!body?.name?.trim()) return reply.code(400).send({ error: "Nome obrigatório" });
  await requireOwnedProfile(request, id, reply);
  if (reply.sent) return;
  const controls = await parseProfileControls(body, reply, true);
  if (!controls) return;
  const profile = await prisma.profile.update({ where: { id }, data: { name: body.name.trim(), avatar: body.avatar, ...controls }, select: profilePublicSelect });
  return toProfileDto(profile);
});
app.delete("/api/profiles/:id", async (request, reply) => { const id = (request.params as { id: string }).id; await requireOwnedProfile(request, id, reply); if (reply.sent) return; await prisma.profile.delete({ where: { id } }); return reply.code(204).send(); });
app.post("/api/profiles/:id/unlock", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const identity = sessionIdentity(request);
  const key = `${request.ip}:${id}`;
  const now = Date.now();
  const attempt = profileUnlockAttempts.get(key);
  if (attempt && attempt.resetAt > now && attempt.count >= 5) return reply.code(429).send({ error: "Muitas tentativas; aguarde alguns minutos" });
  const profile = await prisma.profile.findFirst({ where: { id, accountId: identity.accountId }, select: profilePublicSelect });
  if (!profile) return reply.code(404).send({ error: "Perfil não encontrado" });
  const pin = String((request.body as { pin?: unknown } | null)?.pin ?? "");
  if (profile.pinHash && !await verifyPassword(pin, profile.pinHash)) {
    profileUnlockAttempts.set(key, { count: attempt && attempt.resetAt > now ? attempt.count + 1 : 1, resetAt: now + 5 * 60_000 });
    return reply.code(401).send({ error: "PIN inválido" });
  }
  profileUnlockAttempts.delete(key);
  auth.setProfileSession(reply, identity, profile.id);
  return toProfileDto(profile);
});
app.get("/api/profiles/active", async (request, reply) => {
  const active = auth.profile(request);
  if (!active) return reply.code(401).send({ error: "Selecione um perfil" });
  const profile = await prisma.profile.findFirst({ where: { id: active.profileId, accountId: active.accountId }, select: profilePublicSelect });
  return profile ? toProfileDto(profile) : reply.code(401).send({ error: "Perfil indisponível" });
});
app.get("/api/profiles/:id/preferences", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  await requireActiveOwnedProfile(request, id, reply);
  if (reply.sent) return;
  const profile = await prisma.profile.findUnique({ where: { id }, select: { preferences: true } });
  const stored = readObject(profile?.preferences);
  return {
    autoplayNextEpisode: stored.autoplayNextEpisode !== false,
    subtitleStyle: ["small", "medium", "large"].includes(String(stored.subtitleStyle)) ? stored.subtitleStyle : "medium",
  };
});
app.patch("/api/profiles/:id/preferences", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  await requireActiveOwnedProfile(request, id, reply);
  if (reply.sent) return;
  const body = request.body as { autoplayNextEpisode?: unknown; subtitleStyle?: unknown };
  if (body.autoplayNextEpisode !== undefined && typeof body.autoplayNextEpisode !== "boolean") return reply.code(400).send({ error: "Preferência de autoplay inválida" });
  if (body.subtitleStyle !== undefined && !["small", "medium", "large"].includes(String(body.subtitleStyle))) return reply.code(400).send({ error: "Estilo de legenda inválido" });
  const current = await prisma.profile.findUnique({ where: { id }, select: { preferences: true } });
  const preferences = {
    ...readObject(current?.preferences),
    ...(typeof body.autoplayNextEpisode === "boolean" ? { autoplayNextEpisode: body.autoplayNextEpisode } : {}),
    ...(body.subtitleStyle ? { subtitleStyle: body.subtitleStyle } : {}),
  };
  await prisma.profile.update({ where: { id }, data: { preferences: jsonValue(preferences) } });
  return { autoplayNextEpisode: preferences.autoplayNextEpisode !== false, subtitleStyle: preferences.subtitleStyle ?? "medium" };
});

const workPresentationAssetTypes = ["poster", "poster_card", "poster-card", "backdrop", "backdrop_card", "backdrop-card", "hero", "logo", "logo_webp", "trailer", "motion_preview"];
const seasonPresentationAssetTypes = ["poster", "poster_card", "poster-card", "trailer", "motion_preview", "season_presentation"];
const episodePresentationAssetTypes = ["episode_thumbnail", "thumbnail", "thumbnail_webp"];
const workCardInclude = {
  assets: { where: { seasonId: null, episodeId: null, type: { in: workPresentationAssetTypes }, publication: { state: "confirmed" as const, revisions: { some: { active: true } } } }, orderBy: { createdAt: "desc" as const }, select: { id: true, type: true, publicPath: true, metadata: true } },
  seasons: { where: { hidden: false }, orderBy: { number: "asc" as const }, select: { id: true, number: true, title: true, metadata: true } },
  editorialOverride: true,
} as const;
const catalogAvailabilityWhere: Prisma.WorkWhereInput = { OR: [
  { mediaObjects: { some: { kind: "movie_hls", publication: { state: "confirmed", revisions: { some: { active: true } } } } } },
  { episodes: { some: { hidden: false, activeRevisionId: { not: null }, mediaObjects: { some: { kind: "episode_hls", publication: { state: "confirmed" } } } } } },
] };
const catalogVisibilityWhere: Prisma.WorkWhereInput = { OR: [
  { editorialOverride: null },
  { editorialOverride: { is: { hidden: null } } },
  { editorialOverride: { is: { hidden: false } } },
] };
app.get("/api/home", async (request, reply) => {
  const profile = await requireActiveProfile(request, reply);
  if (!profile) return;
  const kind = parseContentKind((request.query as { kind?: string }).kind);
  const [works, collections, favorites, history] = await Promise.all([
    prisma.work.findMany({ where: { hidden: false, AND: [catalogAvailabilityWhere, catalogVisibilityWhere], ...(kind ? { contentKind: kind } : {}) }, include: workCardInclude, orderBy: [{ editorialOverride: { featured: "desc" } }, { createdAt: "desc" }], take: 80 }),
    prisma.editorialCollection.findMany({
      where: { state: "published", active: true },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { publishedAt: "desc" }],
      take: 20,
      include: { items: {
        where: { work: { hidden: false, AND: [catalogAvailabilityWhere, catalogVisibilityWhere], ...(kind ? { contentKind: kind } : {}) } },
        orderBy: { position: "asc" },
        include: { work: { include: workCardInclude } },
      } },
    }),
    prisma.favorite.findMany({ where: { profileId: profile.id }, take: 30, select: { workId: true, work: { select: { metadata: true, contentKind: true } } } }),
    prisma.viewingProgress.findMany({ where: { profileId: profile.id }, orderBy: { updatedAt: "desc" }, take: 30, select: { workId: true, episode: { select: { workId: true, work: { select: { metadata: true, contentKind: true } } } }, work: { select: { metadata: true, contentKind: true } } } }),
  ]);
  const cards = works.filter((work) => profileAllowsWork(profile.maxAgeRating, work)).slice(0, 40).map(toWorkCardDto);
  const collectionRows = collections.map((collection) => ({
    id: `collection:${collection.slug}`,
    title: collection.title,
    items: collection.items.map((item) => item.work).filter((work) => profileAllowsWork(profile.maxAgeRating, work)).map(toWorkCardDto),
  })).filter((row) => row.items.length > 0);
  const genreRows = catalogGenreRows(cards);
  const dubbed = cards.filter((item) => catalogAvailability(item).includes("DUB"));
  const subtitled = cards.filter((item) => catalogAvailability(item).includes("LEG"));
  const recommendationSeeds = [...favorites.map((row) => ({ id: row.workId, ...row.work })), ...history.map((row) => row.work ? ({ id: row.workId!, ...row.work }) : row.episode ? ({ id: row.episode.workId, ...row.episode.work }) : null).filter((row): row is { id: string; metadata: Prisma.JsonValue; contentKind: "movie" | "series" | "anime" } => Boolean(row))];
  const seedIds = new Set(recommendationSeeds.map((seed) => seed.id));
  const taste = recommendationSeeds.flatMap((seed) => recommendationTokens(seed.metadata));
  const seedKinds = recommendationSeeds.map((seed) => seed.contentKind);
  const recommendations = cards.filter((card) => !seedIds.has(card.id)).map((card) => ({ card, score: recommendationScore(card, taste, seedKinds) })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 20).map((entry) => entry.card);
  return toJson({ hero: cards.find((item) => item.featured) ?? cards[0] ?? null, rows: [
    { id: "featured", title: "Destaques", items: cards.filter((item) => item.featured) },
    { id: "recommended", title: "Para você", items: recommendations },
    { id: "recent", title: "Adicionados recentemente", items: cards },
    { id: "dubbed", title: "Dublado", items: dubbed },
    { id: "subtitled", title: "Legendado", items: subtitled },
    ...collectionRows,
    { id: "movies", title: "Filmes", items: cards.filter((item) => item.contentKind === "movie") },
    { id: "series", title: "Séries", items: cards.filter((item) => item.contentKind === "series") },
    { id: "anime", title: "Animes", items: cards.filter((item) => item.contentKind === "anime") },
    ...genreRows,
  ] });
});
app.get("/api/search", async (request, reply) => {
  const profile = await requireActiveProfile(request, reply);
  if (!profile) return;
  const query = request.query as { q?: string; cursor?: string; limit?: string; kind?: string };
  const q = String(query.q ?? "").trim().slice(0, 200);
  if (!q) return { items: [], nextCursor: null };
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit ?? "24", 10) || 24));
  const kind = parseContentKind(query.kind);
  const cursor = query.cursor ? await prisma.work.findUnique({ where: { id: query.cursor }, select: { id: true, createdAt: true } }) : null;
  const works = await prisma.work.findMany({
    where: {
      hidden: false,
      ...(kind ? { contentKind: kind } : {}),
      AND: [
        catalogAvailabilityWhere,
        catalogVisibilityWhere,
        { OR: [
          { title: { contains: q, mode: "insensitive" } },
          { originalTitle: { contains: q, mode: "insensitive" } },
          { synopsis: { contains: q, mode: "insensitive" } },
          { searchText: { contains: q, mode: "insensitive" } },
          { editorialOverride: { is: { title: { contains: q, mode: "insensitive" } } } },
          { editorialOverride: { is: { synopsis: { contains: q, mode: "insensitive" } } } },
        ] },
        ...(cursor ? [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] : []),
      ],
    },
    include: workCardInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(201, limit * 4 + 1),
  });
  const allowed = works.filter((work) => profileAllowsWork(profile.maxAgeRating, work));
  const hasMore = allowed.length > limit || works.length === Math.min(201, limit * 4 + 1);
  const page = allowed.slice(0, limit);
  const nextCursor = hasMore ? (page.at(-1)?.id ?? works.at(-1)?.id ?? null) : null;
  return toJson({ items: page.map(toWorkCardDto), nextCursor });
});
app.get("/api/works/:id", async (request, reply) => {
  const profile = await requireActiveProfile(request, reply);
  if (!profile) return;
  const work = await prisma.work.findUnique({
    where: { id: (request.params as { id: string }).id },
    include: {
      assets: { where: { seasonId: null, episodeId: null, type: { in: workPresentationAssetTypes }, publication: { state: "confirmed", revisions: { some: { active: true } } } }, orderBy: { createdAt: "desc" } },
      seasons: {
        where: { hidden: false },
        orderBy: { number: "asc" },
        include: {
          assets: { where: { episodeId: null, type: { in: seasonPresentationAssetTypes }, publication: { state: "confirmed", revisions: { some: { active: true } } } }, orderBy: { createdAt: "desc" } },
          episodes: {
            where: { hidden: false },
            orderBy: { number: "asc" },
            include: { assets: { where: { type: { in: episodePresentationAssetTypes }, publication: { state: "confirmed" } }, orderBy: { createdAt: "desc" } } }
          }
        }
      },
      editorialOverride: true,
    }
  });
  if (!work || work.hidden || work.editorialOverride?.hidden === true || !profileAllowsWork(profile.maxAgeRating, work)) return reply.code(404).send({ error: "Obra não encontrada" });
  const activeRevisionIds = work.seasons.flatMap((season) => season.episodes.map((episode) => episode.activeRevisionId).filter((id): id is string => Boolean(id)));
  const activeRevisions = activeRevisionIds.length
    ? await prisma.revision.findMany({ where: { id: { in: activeRevisionIds } }, select: { id: true, publicationId: true } })
    : [];
  const publicationByRevision = new Map(activeRevisions.map((revision) => [revision.id, revision.publicationId]));
  const episodeIds = work.seasons.flatMap((season) => season.episodes.map((episode) => episode.id));
  const activeMedia = episodeIds.length ? await prisma.mediaObject.findMany({
    where: { episodeId: { in: episodeIds }, kind: "episode_hls", publication: { state: "confirmed" } },
    select: { episodeId: true, publicationId: true }
  }) : [];
  const playablePairs = new Set(activeMedia.map((media) => `${media.episodeId}:${media.publicationId}`));
  for (const season of work.seasons) {
    season.episodes = season.episodes.filter((episode) => {
      const publicationId = episode.activeRevisionId ? publicationByRevision.get(episode.activeRevisionId) : undefined;
      if (!publicationId || !playablePairs.has(`${episode.id}:${publicationId}`)) return false;
      episode.assets = episode.assets.filter((asset) => asset.publicationId === publicationId);
      return true;
    });
  }
  return toJson(toWorkDetailsDto(work));
});

app.post("/api/profiles/:profileId/favorites/:workId", async (request, reply) => {
  const { profileId, workId } = request.params as { profileId: string; workId: string };
  const profile = await requireActiveOwnedProfile(request, profileId, reply);
  if (!profile) return;
  if (!await profileAllowsItem(profile.maxAgeRating, workId)) return reply.code(404).send({ error: "Obra não encontrada" });
  await prisma.favorite.upsert({ where: { profileId_workId: { profileId, workId } }, create: { profileId, workId }, update: {} });
  return reply.code(204).send();
});
app.delete("/api/profiles/:profileId/favorites/:workId", async (request, reply) => {
  const { profileId, workId } = request.params as { profileId: string; workId: string };
  await requireActiveOwnedProfile(request, profileId, reply);
  if (reply.sent) return;
  await prisma.favorite.deleteMany({ where: { profileId, workId } });
  return reply.code(204).send();
});
app.get("/api/profiles/:profileId/favorites", async (request, reply) => {
  const profileId = (request.params as { profileId: string }).profileId;
  const profile = await requireActiveOwnedProfile(request, profileId, reply);
  if (!profile) return;
  const rows = await prisma.favorite.findMany({ where: { profileId }, orderBy: { createdAt: "desc" }, include: { work: { include: workCardInclude } } });
  return toJson(rows.map((row) => row.work).filter((work) => !work.hidden && work.editorialOverride?.hidden !== true && profileAllowsWork(profile.maxAgeRating, work)).map(toWorkCardDto));
});
app.put("/api/profiles/:profileId/progress/:itemId", async (request, reply) => {
  const { profileId, itemId } = request.params as { profileId: string; itemId: string };
  const profile = await requireActiveOwnedProfile(request, profileId, reply);
  if (!profile) return;
  if (!await profileAllowsItem(profile.maxAgeRating, itemId)) return reply.code(404).send({ error: "Item não encontrado" });
  const body = request.body as { positionSeconds?: number; durationSeconds?: number };
  const positionSeconds = Math.max(0, Math.floor(Number(body?.positionSeconds)));
  const durationSeconds = body?.durationSeconds == null ? null : Math.max(0, Math.floor(Number(body.durationSeconds)));
  if (!Number.isFinite(positionSeconds) || (durationSeconds !== null && !Number.isFinite(durationSeconds))) return reply.code(400).send({ error: "Progresso inválido" });
  const completed = Boolean(durationSeconds && positionSeconds / durationSeconds >= 0.9);
  const [work, episode] = await Promise.all([prisma.work.findUnique({ where: { id: itemId }, select: { id: true } }), prisma.episode.findUnique({ where: { id: itemId }, select: { id: true } })]);
  if (!work && !episode) return reply.code(404).send({ error: "Item não encontrado" });
  if (work) await prisma.viewingProgress.upsert({ where: { profileId_workId: { profileId, workId: work.id } }, create: { profileId, workId: work.id, positionSeconds, durationSeconds, completed }, update: { positionSeconds, durationSeconds, completed } });
  else await prisma.viewingProgress.upsert({ where: { profileId_episodeId: { profileId, episodeId: episode!.id } }, create: { profileId, episodeId: episode!.id, positionSeconds, durationSeconds, completed }, update: { positionSeconds, durationSeconds, completed } });
  return reply.code(204).send();
});
app.get("/api/profiles/:profileId/progress/:itemId", async (request, reply) => {
  const { profileId, itemId } = request.params as { profileId: string; itemId: string };
  await requireActiveOwnedProfile(request, profileId, reply);
  if (reply.sent) return;
  const row = await prisma.viewingProgress.findFirst({ where: { profileId, OR: [{ workId: itemId }, { episodeId: itemId }] } });
  return row ? toJson(row) : { positionSeconds: 0, durationSeconds: null, completed: false };
});
app.get("/api/profiles/:profileId/continue-watching", async (request, reply) => {
  const profileId = (request.params as { profileId: string }).profileId;
  const profile = await requireActiveOwnedProfile(request, profileId, reply);
  if (!profile) return;
  const rows = await prisma.viewingProgress.findMany({ where: { profileId, completed: false, positionSeconds: { gt: 0 } }, orderBy: { updatedAt: "desc" }, include: { work: { include: workCardInclude }, episode: { include: { work: { include: workCardInclude }, season: { select: { number: true } } } } }, take: 30 });
  const seen = new Set<string>();
  return toJson(rows.flatMap((row) => {
    const work = row.work ?? row.episode?.work;
    if (!work || work.hidden || work.editorialOverride?.hidden === true || !profileAllowsWork(profile.maxAgeRating, work) || seen.has(work.id)) return [];
    seen.add(work.id);
    const duration = row.durationSeconds ?? 0;
    return [{
      ...toWorkCardDto(work),
      continueWatching: {
        itemId: row.episode?.id ?? work.id,
        itemType: row.episode ? "episode" : "movie",
        episodeNumber: row.episode?.number ?? null,
        episodeTitle: row.episode?.title ?? null,
        seasonNumber: row.episode?.season.number ?? null,
        positionSeconds: row.positionSeconds,
        durationSeconds: row.durationSeconds,
        progressPercent: duration > 0 ? Math.min(100, Math.round((row.positionSeconds / duration) * 100)) : 0,
        updatedAt: row.updatedAt
      }
    }];
  }));
});
app.get("/api/profiles/:profileId/up-next", async (request, reply) => {
  const profileId = (request.params as { profileId: string }).profileId;
  const profile = await requireActiveOwnedProfile(request, profileId, reply);
  if (!profile) return;
  const [completed, inProgress] = await Promise.all([
    prisma.viewingProgress.findMany({
      where: { profileId, completed: true, episodeId: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: { episode: { include: { season: { select: { id: true, number: true } } } } },
    }),
    prisma.viewingProgress.findMany({
      where: { profileId, completed: false, positionSeconds: { gt: 0 }, episodeId: { not: null } },
      select: { episodeId: true },
    }),
  ]);
  const inProgressEpisodes = new Set(inProgress.map((progress) => progress.episodeId).filter((id): id is string => Boolean(id)));
  const output: Array<ReturnType<typeof toWorkCardDto> & { continueWatching: Record<string, unknown> }> = [];
  const seenWorks = new Set<string>();
  for (const progress of completed) {
    const episode = progress.episode;
    if (!episode || seenWorks.has(episode.workId)) continue;
    seenWorks.add(episode.workId);
    const next = await findNextPlayableEpisode(episode.workId, episode.seasonId, episode.season.number, episode.number);
    if (!next || inProgressEpisodes.has(next.id)) continue;
    const work = await prisma.work.findUnique({ where: { id: episode.workId }, include: workCardInclude });
    if (!work || work.hidden || work.editorialOverride?.hidden === true || !profileAllowsWork(profile.maxAgeRating, work)) continue;
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

app.get("/api/playback/items/:itemId", async (request, reply) => {
  const profile = await requireActiveProfile(request, reply);
  if (!profile) return;
  const { itemId } = request.params as { itemId: string };
  const work = await prisma.work.findUnique({ where: { id: itemId }, include: { editorialOverride: true, seasons: { select: { metadata: true } }, mediaObjects: { where: { kind: "movie_hls", publication: { state: "confirmed", revisions: { some: { active: true } } } }, orderBy: { createdAt: "desc" } } } });
  if (work) {
    if (!profileAllowsWork(profile.maxAgeRating, work)) return reply.code(404).send({ error: "Item não encontrado" });
    const media = work.mediaObjects[0];
    if (!media?.publicPath) return reply.code(404).send({ error: "Mídia do filme não encontrada" });
    const tracks = await playbackTracks(media.publicationId);
    return { itemType: "movie", title: work.editorialOverride?.title ?? work.title, originalUrl: media.publicPath, delivery: readNestedObject(media.codecs, "delivery") ?? readObject(media.codecs), markers: readNestedArray(media.codecs, "markers"), ...tracks, nextEpisode: null, fallback: { available: true, status: "not_requested" } };
  }
  const episode = await prisma.episode.findUnique({ where: { id: itemId }, include: { work: { include: { editorialOverride: true } }, season: true } });
  if (!episode) return reply.code(404).send({ error: "Item não encontrado" });
  if (!profileAllowsWork(profile.maxAgeRating, { ...episode.work, seasons: [episode.season] })) return reply.code(404).send({ error: "Item não encontrado" });
  const media = await activeEpisodeMedia(episode.id, episode.activeRevisionId);
  if (!media?.publicPath) return reply.code(404).send({ error: "Mídia do episódio não encontrada" });
  const [tracks, next, episodeNavigation] = await Promise.all([
    playbackTracks(media.publicationId, episode.id),
    findNextPlayableEpisode(episode.workId, episode.seasonId, episode.season.number, episode.number),
    findPlayableSeasonEpisodes(episode.seasonId),
  ]);
  return { itemType: "episode", itemId: episode.id, seasonNumber: episode.season.number, title: `${episode.work.editorialOverride?.title ?? episode.work.title} — ${episode.title ?? `Episódio ${episode.number}`}`, originalUrl: media.publicPath, delivery: readObject(media.codecs), markers: episode.markers, ...tracks, episodes: episodeNavigation, nextEpisode: next ? { id: next.id, number: next.number, title: next.title } : null, fallback: { available: true, status: "not_requested" } };
});

app.post("/api/playback/items/:itemId/fallback", async (request, reply) => {
  const profile = await requireActiveProfile(request, reply);
  if (!profile) return;
  const itemId = (request.params as { itemId: string }).itemId;
  if (!await profileAllowsItem(profile.maxAgeRating, itemId)) return reply.code(404).send({ error: "Mídia não encontrada" });
  const media = await findPlaybackMedia(itemId);
  if (!media) return reply.code(404).send({ error: "Mídia não encontrada" });
  const cacheKey = crypto.createHash("sha256").update(`${media.publicPath}:h264-ladder-v2-timestamps:${env.ffmpegPreset}:${env.ffmpegCrf}`).digest("hex");
  const outputPath = path.join(env.dataRoot, "transcode-cache", cacheKey);
  const sourcePath = safeDataPath("library", media.publicPath.replace(/^\/media\//, ""));
  const existing = await prisma.transcodeJob.findUnique({ where: { cacheKey } });
  const job = existing?.state === "failed" ? await prisma.transcodeJob.update({ where: { id: existing.id }, data: { state: "queued", error: null, lastAccessAt: new Date() } }) : await prisma.transcodeJob.upsert({ where: { cacheKey }, create: { cacheKey, sourcePath, outputPath, state: "queued" }, update: { lastAccessAt: new Date() } });
  return reply.code(job.state === "finished" ? 200 : 202).send({ jobId: job.id, cacheKey, status: job.state, adaptive: true, url: `/transcode/${cacheKey}/master.m3u8` });
});
app.get("/api/playback/jobs/:jobId", async (request, reply) => {
  if (!await requireActiveProfile(request, reply)) return;
  const job = await prisma.transcodeJob.findUnique({ where: { id: (request.params as { jobId: string }).jobId } });
  return job ? toJson({ id: job.id, status: job.state, error: job.error, adaptive: true, url: job.state === "finished" ? `/transcode/${job.cacheKey}/master.m3u8` : undefined }) : reply.code(404).send({ error: "Job não encontrado" });
});

app.get("/api/admin/events", async (request, reply) => {
  const identity = sessionIdentity(request);
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
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
          where: { id: identity.accountId, disabled: false, role: { in: ["owner", "admin"] } },
          select: { id: true },
        });
        if (!account) { reply.raw.end(); return; }
      }
      const snapshot = await readAdminEventSnapshot();
      const changed = previous ? (Object.keys(snapshot) as Array<keyof AdminEventSnapshot>).filter((key) => snapshot[key] !== previous![key]) : Object.keys(snapshot);
      if (changed.length) {
        reply.raw.write(`event: operations\ndata: ${JSON.stringify({ changed, snapshot, at: new Date().toISOString() })}\n\n`);
        previous = snapshot;
      }
    } catch (error) {
      request.log.error({ err: error }, "admin event stream refresh failed");
      reply.raw.write(`event: stream-error\ndata: ${JSON.stringify({ error: "refresh_failed" })}\n\n`);
    } finally {
      running = false;
    }
  };

  await sendSnapshot();
  const refreshTimer = setInterval(() => { void sendSnapshot(); }, 2_000);
  const heartbeatTimer = setInterval(() => { if (!closed) reply.raw.write(`: heartbeat ${Date.now()}\n\n`); }, 15_000);
  reply.raw.once("close", () => {
    closed = true;
    clearInterval(refreshTimer);
    clearInterval(heartbeatTimer);
  });
});

app.get("/api/admin/dashboard", async () => {
  const now = new Date();
  const [works, seasons, episodes, publications, transcodes, publicationProcessing, publicationRetrying, publicationFailed, transcodeQueued, transcodeFailed] = await Promise.all([
    prisma.work.count(),
    prisma.season.count(),
    prisma.episode.count(),
    prisma.publication.count(),
    prisma.transcodeJob.count(),
    prisma.publication.count({ where: { state: { in: ["validating", "promoting"] }, finalizationLeaseUntil: { gt: now } } }),
    prisma.publication.count({ where: { state: { in: ["validating", "promoting"] }, finalizationNextAttemptAt: { gt: now } } }),
    prisma.publication.count({ where: { state: "failed" } }),
    prisma.transcodeJob.count({ where: { state: { in: ["queued", "processing"] } } }),
    prisma.transcodeJob.count({ where: { state: "failed" } }),
  ]);
  return { works, seasons, episodes, publications, transcodes, publicationProcessing, publicationRetrying, publicationFailed, transcodeQueued, transcodeFailed };
});
app.get("/api/admin/storage", async () => {
  const [assets, media, publications, transcodes, disk] = await Promise.all([
    prisma.asset.aggregate({ _sum: { sizeBytes: true }, _count: { _all: true } }),
    prisma.mediaObject.aggregate({ _sum: { sizeBytes: true }, _count: { _all: true } }),
    prisma.publication.aggregate({ _sum: { totalSizeBytes: true }, _count: { _all: true } }),
    prisma.transcodeJob.aggregate({ _sum: { sizeBytes: true }, _count: { _all: true } }),
    fs.promises.statfs(env.dataRoot).then((value) => ({ totalBytes: Number(value.blocks) * Number(value.bsize), freeBytes: Number(value.bavail) * Number(value.bsize) })).catch(() => null),
  ]);
  return toJson({ assets: { count: assets._count._all, bytes: assets._sum.sizeBytes ?? 0n }, media: { count: media._count._all, bytes: media._sum.sizeBytes ?? 0n }, publications: { count: publications._count._all, bytes: publications._sum.totalSizeBytes ?? 0n }, transcodeCache: { count: transcodes._count._all, bytes: transcodes._sum.sizeBytes ?? 0n }, disk });
});
app.get("/api/admin/publications", async (request) => {
  const query = request.query as { cursor?: string; limit?: string; state?: string };
  const limit = Math.min(100, Math.max(10, Number.parseInt(query.limit ?? "25", 10) || 25));
  const state = Object.values(PublicationState).find((value) => value === query.state);
  const rows = await prisma.publication.findMany({
    where: state ? { state } : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    take: limit + 1,
    include: { receipt: true, revisions: { select: { id: true, number: true, scopeKey: true, active: true } }, _count: { select: { files: true } } },
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return toJson({ items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null });
});
app.get("/api/admin/publications/:id", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const publication = await prisma.publication.findUnique({ where: { id }, include: { files: { orderBy: { relativePath: "asc" } }, receipt: true, revisions: { orderBy: { number: "desc" } } } });
  if (!publication) return reply.code(404).send({ error: "Publicação não encontrada" });
  const revision = publication.revisions[0];
  const previous = revision ? await prisma.revision.findFirst({ where: { scopeKey: revision.scopeKey, number: { lt: revision.number } }, orderBy: { number: "desc" }, select: { number: true, snapshot: true } }) : null;
  const currentAssets = manifestAssetMap(publication.manifest);
  const previousAssets = manifestAssetMap(previous?.snapshot);
  const added = [...currentAssets.keys()].filter((path) => !previousAssets.has(path));
  const removed = [...previousAssets.keys()].filter((path) => !currentAssets.has(path));
  const changed = [...currentAssets.keys()].filter((path) => previousAssets.has(path) && currentAssets.get(path) !== previousAssets.get(path));
  return toJson({ ...publication, diff: { previousRevision: previous?.number ?? null, added, removed, changed } });
});
app.delete("/api/admin/publications/:id", async (request, reply) => {
  if (!requireOwner(request, reply)) return;
  const id = (request.params as { id: string }).id;
  const body = request.body as { confirmPackageId?: unknown };
  const confirmPackageId = typeof body?.confirmPackageId === "string" ? body.confirmPackageId.trim() : "";
  if (!confirmPackageId) return reply.code(400).send({
    error: "Digite o package_id completo para confirmar a exclusão"
  });
  try {
    const result = await deletePublicationCompletely(
      id, confirmPackageId, sessionIdentity(request).accountId);
    return reply.send(result);
  } catch (error) {
    if (error instanceof PublicationDeletionConflict) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    throw error;
  }
});
app.get("/api/admin/integrity", async () => toJson(await prisma.integrityCheck.findMany({
  orderBy: { startedAt: "desc" },
  take: 20,
  select: { id: true, state: true, checkedAssets: true, hashedAssets: true, missingAssets: true, corruptAssets: true, startedAt: true, completedAt: true },
})));
app.get("/api/admin/catalog", async (request) => {
  const query = request.query as { q?: string; cursor?: string };
  const q = String(query.q ?? "").trim().slice(0, 200);
  const works = await prisma.work.findMany({
    where: q ? { OR: [
      { title: { contains: q, mode: "insensitive" } },
      { originalTitle: { contains: q, mode: "insensitive" } },
      { editorialOverride: { is: { title: { contains: q, mode: "insensitive" } } } },
    ] } : undefined,
    include: { editorialOverride: true, _count: { select: { seasons: true, episodes: true } } },
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
      override: work.editorialOverride ? {
        title: work.editorialOverride.title,
        synopsis: work.editorialOverride.synopsis,
        hidden: work.editorialOverride.hidden,
        featured: work.editorialOverride.featured,
        updatedAt: work.editorialOverride.updatedAt,
      } : null,
      seasonCount: work._count.seasons,
      episodeCount: work._count.episodes,
    })),
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  });
});
app.get("/api/admin/works/:id", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const work = await prisma.work.findUnique({ where: { id }, include: {
    editorialOverride: true,
    assets: { where: { type: { in: workPresentationAssetTypes } }, orderBy: { createdAt: "desc" }, select: { id: true, type: true, publicPath: true, sizeBytes: true, metadata: true } },
    seasons: { orderBy: { number: "asc" }, include: { assets: { where: { type: { in: seasonPresentationAssetTypes } }, select: { id: true, type: true, publicPath: true, sizeBytes: true } }, episodes: { orderBy: { number: "asc" }, select: { id: true, number: true, title: true, hidden: true, activeRevisionId: true } } } },
  } });
  return work ? toJson(work) : reply.code(404).send({ error: "Obra não encontrada" });
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
  const confirmTitle = typeof body?.confirmTitle === "string" ? body.confirmTitle.trim() : "";
  if (!confirmTitle) return reply.code(400).send({
    error: "Digite o título canônico completo para confirmar a exclusão"
  });
  if (activeWorkDeletions.has(id)) {
    return reply.code(409).send({ error: "Esta obra já está sendo excluída" });
  }
  activeWorkDeletions.add(id);
  try {
    const result = await deleteWorkCompletely(id, confirmTitle, sessionIdentity(request).accountId);
    return reply.send(toJson(result));
  } catch (error) {
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
  if (typeof body.hidden !== "boolean") return reply.code(400).send({ error: "Visibilidade inválida" });
  const before = await prisma.season.findUnique({ where: { id }, select: { id: true, hidden: true, workId: true } });
  if (!before) return reply.code(404).send({ error: "Temporada não encontrada" });
  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.season.update({ where: { id }, data: { hidden: body.hidden as boolean }, select: { id: true, hidden: true, workId: true } });
    await tx.auditLog.create({ data: { actorAccountId: identity.accountId, action: "season.visibility_updated", targetType: "season", targetId: id, beforeValue: jsonValue(before), afterValue: jsonValue(value) } });
    return value;
  });
  return updated;
});
app.patch("/api/admin/episodes/:id", async (request, reply) => {
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  const body = request.body as { hidden?: unknown };
  if (typeof body.hidden !== "boolean") return reply.code(400).send({ error: "Visibilidade inválida" });
  const before = await prisma.episode.findUnique({ where: { id }, select: { id: true, hidden: true, workId: true, seasonId: true } });
  if (!before) return reply.code(404).send({ error: "Episódio não encontrado" });
  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.episode.update({ where: { id }, data: { hidden: body.hidden as boolean }, select: { id: true, hidden: true, workId: true, seasonId: true } });
    await tx.auditLog.create({ data: { actorAccountId: identity.accountId, action: "episode.visibility_updated", targetType: "episode", targetId: id, beforeValue: jsonValue(before), afterValue: jsonValue(value) } });
    return value;
  });
  return updated;
});
app.patch("/api/admin/works/:id/presentation", async (request, reply) => {
  const identity = sessionIdentity(request);
  const workId = (request.params as { id: string }).id;
  const body = request.body as { assetType?: unknown; assetId?: unknown };
  if (typeof body.assetType !== "string" || typeof body.assetId !== "string") return reply.code(400).send({ error: "Asset inválido" });
  const asset = await prisma.asset.findFirst({ where: { id: body.assetId, workId, type: body.assetType }, select: { id: true } });
  if (!asset) return reply.code(404).send({ error: "Asset de apresentação não encontrado" });
  const current = await prisma.editorialOverride.findUnique({ where: { workId } });
  const metadata = readObject(current?.metadata);
  const preferredAssets = { ...readObject(metadata.preferred_assets), [body.assetType]: body.assetId };
  const override = await prisma.$transaction(async (tx) => {
    const value = await tx.editorialOverride.upsert({ where: { workId }, create: { workId, updatedByAccountId: identity.accountId, metadata: jsonValue({ ...metadata, preferred_assets: preferredAssets }) }, update: { updatedByAccountId: identity.accountId, metadata: jsonValue({ ...metadata, preferred_assets: preferredAssets }) } });
    await tx.auditLog.create({ data: { actorAccountId: identity.accountId, action: "work.presentation_asset_updated", targetType: "work", targetId: workId, beforeValue: jsonValue(editorialAuditValue(current)), afterValue: jsonValue(editorialAuditValue(value)) } });
    return value;
  });
  return toJson(override);
});
app.patch("/api/admin/works/:id/editorial", async (request, reply) => {
  const workId = (request.params as { id: string }).id;
  const identity = sessionIdentity(request);
  const body = request.body as { title?: unknown; synopsis?: unknown; hidden?: unknown; featured?: unknown };
  if (body.title !== undefined && body.title !== null && typeof body.title !== "string") return reply.code(400).send({ error: "Título inválido" });
  if (body.synopsis !== undefined && body.synopsis !== null && typeof body.synopsis !== "string") return reply.code(400).send({ error: "Sinopse inválida" });
  if (typeof body.title === "string" && body.title.trim().length > 300) return reply.code(400).send({ error: "Título excede 300 caracteres" });
  if (typeof body.synopsis === "string" && body.synopsis.trim().length > 10_000) return reply.code(400).send({ error: "Sinopse excede 10.000 caracteres" });
  if (body.hidden !== undefined && body.hidden !== null && typeof body.hidden !== "boolean") return reply.code(400).send({ error: "Visibilidade inválida" });
  if (body.featured !== undefined && body.featured !== null && typeof body.featured !== "boolean") return reply.code(400).send({ error: "Destaque inválido" });

  const result = await prisma.$transaction(async (tx) => {
    const work = await tx.work.findUnique({ where: { id: workId }, include: { editorialOverride: true } });
    if (!work) return null;
    const cleanTitle: string | null | undefined = typeof body.title === "string" ? body.title.trim() || null : body.title === null ? null : undefined;
    const cleanSynopsis: string | null | undefined = typeof body.synopsis === "string" ? body.synopsis.trim() || null : body.synopsis === null ? null : undefined;
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
        ...(body.synopsis !== undefined ? { synopsis: cleanSynopsis ?? null } : {}),
        ...(body.hidden !== undefined ? { hidden: body.hidden as boolean | null } : {}),
        ...(body.featured !== undefined ? { featured: body.featured as boolean | null } : {}),
      },
    });
    await tx.auditLog.create({ data: {
      actorAccountId: identity.accountId,
      action: "editorial_override.updated",
      targetType: "work",
      targetId: workId,
      beforeValue: jsonValue(editorialAuditValue(work.editorialOverride)),
      afterValue: jsonValue(editorialAuditValue(override)),
    } });
    return { id: workId, title: override.title ?? work.title, synopsis: override.synopsis ?? work.synopsis, hidden: override.hidden ?? work.hidden, featured: override.featured ?? false, override };
  });
  return result ? toJson(result) : reply.code(404).send({ error: "Obra não encontrada" });
});
app.get("/api/admin/collections", async () => toJson(await prisma.editorialCollection.findMany({
  orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
  include: { items: { orderBy: { position: "asc" }, include: { work: { select: { id: true, title: true, contentKind: true, editorialOverride: { select: { title: true, hidden: true } } } } } } },
})));
app.post("/api/admin/collections", async (request, reply) => {
  const identity = sessionIdentity(request);
  const body = request.body as { title?: unknown; slug?: unknown };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const slug = normalizeCollectionSlug(typeof body.slug === "string" ? body.slug : title);
  if (!title || title.length > 120) return reply.code(400).send({ error: "Título obrigatório, com até 120 caracteres" });
  if (!slug) return reply.code(400).send({ error: "Slug inválido" });
  const existing = await prisma.editorialCollection.findUnique({ where: { slug }, select: { id: true } });
  if (existing) return reply.code(409).send({ error: "Já existe uma coleção com este slug" });
  const collection = await prisma.$transaction(async (tx) => {
    const created = await tx.editorialCollection.create({ data: { title, slug, createdByAccountId: identity.accountId, updatedByAccountId: identity.accountId } });
    await tx.auditLog.create({ data: { actorAccountId: identity.accountId, action: "editorial_collection.created", targetType: "editorial_collection", targetId: created.id, afterValue: jsonValue(collectionAuditValue(created, [])) } });
    return created;
  });
  return reply.code(201).send(toJson({ ...collection, items: [] }));
});
app.patch("/api/admin/collections/:id", async (request, reply) => {
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  const body = request.body as { title?: unknown; slug?: unknown; description?: unknown; active?: unknown; featured?: unknown; sortOrder?: unknown; workIds?: unknown };
  const parsed = parseCollectionInput(body);
  if ("error" in parsed) return reply.code(400).send({ error: parsed.error });
  if (parsed.data.slug) {
    const duplicate = await prisma.editorialCollection.findFirst({ where: { slug: parsed.data.slug, id: { not: id } }, select: { id: true } });
    if (duplicate) return reply.code(409).send({ error: "Já existe uma coleção com este slug" });
  }
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.editorialCollection.findUnique({ where: { id }, include: { items: { orderBy: { position: "asc" } } } });
    if (!current) return null;
    if (current.state === "published") return { conflict: true as const };
    if (parsed.workIds) {
      const found = await tx.work.count({ where: { id: { in: parsed.workIds } } });
      if (found !== parsed.workIds.length) return { missing: true as const };
    }
    const updated = await tx.editorialCollection.update({ where: { id }, data: { ...parsed.data, updatedByAccountId: identity.accountId } });
    if (parsed.workIds) {
      await tx.editorialCollectionItem.deleteMany({ where: { collectionId: id } });
      if (parsed.workIds.length) await tx.editorialCollectionItem.createMany({ data: parsed.workIds.map((workId, position) => ({ collectionId: id, workId, position })) });
    }
    const workIds = parsed.workIds ?? current.items.map((item) => item.workId);
    await tx.auditLog.create({ data: { actorAccountId: identity.accountId, action: "editorial_collection.draft_updated", targetType: "editorial_collection", targetId: id, beforeValue: jsonValue(collectionAuditValue(current, current.items.map((item) => item.workId))), afterValue: jsonValue(collectionAuditValue(updated, workIds)) } });
    return { collection: updated, workIds };
  });
  if (!result) return reply.code(404).send({ error: "Coleção não encontrada" });
  if ("conflict" in result) return reply.code(409).send({ error: "Coleções publicadas devem voltar para rascunho antes da edição" });
  if ("missing" in result) return reply.code(400).send({ error: "Uma ou mais obras não existem" });
  return toJson(result);
});
app.post("/api/admin/collections/:id/unpublish", async (request, reply) => {
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  const updated = await prisma.editorialCollection.updateMany({ where: { id, state: "published" }, data: { state: "draft", publishedAt: null, updatedByAccountId: identity.accountId } });
  if (!updated.count) return reply.code(409).send({ error: "Coleção não está publicada" });
  await prisma.auditLog.create({ data: { actorAccountId: identity.accountId, action: "editorial_collection.unpublished", targetType: "editorial_collection", targetId: id } });
  return reply.code(204).send();
});
app.get("/api/admin/collections/:id/preview", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const collection = await prisma.editorialCollection.findUnique({ where: { id }, include: { items: { orderBy: { position: "asc" }, include: { work: { include: workCardInclude } } } } });
  if (!collection) return reply.code(404).send({ error: "Coleção não encontrada" });
  const eligibleIds = new Set((await prisma.work.findMany({ where: { id: { in: collection.items.map((item) => item.workId) }, hidden: false, AND: [catalogAvailabilityWhere, catalogVisibilityWhere] }, select: { id: true } })).map((work) => work.id));
  const items = collection.items.map((item) => ({ work: toWorkCardDto(item.work), eligible: eligibleIds.has(item.workId) }));
  return toJson({ id: collection.id, title: collection.title, state: collection.state, valid: items.length > 0 && items.every((item) => item.eligible), items });
});
app.post("/api/admin/collections/:id/publish", async (request, reply) => {
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  const collection = await prisma.editorialCollection.findUnique({ where: { id }, include: { items: { orderBy: { position: "asc" } } } });
  if (!collection) return reply.code(404).send({ error: "Coleção não encontrada" });
  const eligible = await prisma.work.count({ where: { id: { in: collection.items.map((item) => item.workId) }, hidden: false, AND: [catalogAvailabilityWhere, catalogVisibilityWhere] } });
  if (!collection.items.length || eligible !== collection.items.length) return reply.code(409).send({ error: "A coleção possui obras ocultas, indisponíveis ou está vazia" });
  const publishedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const value = await tx.editorialCollection.update({ where: { id }, data: { state: "published", publishedAt, updatedByAccountId: identity.accountId } });
    await tx.auditLog.create({ data: { actorAccountId: identity.accountId, action: "editorial_collection.published", targetType: "editorial_collection", targetId: id, beforeValue: jsonValue(collectionAuditValue(collection, collection.items.map((item) => item.workId))), afterValue: jsonValue(collectionAuditValue(value, collection.items.map((item) => item.workId))) } });
    return value;
  });
  return toJson(updated);
});
app.delete("/api/admin/collections/:id", async (request, reply) => {
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  const collection = await prisma.editorialCollection.findUnique({ where: { id }, include: { items: true } });
  if (!collection) return reply.code(404).send({ error: "Coleção não encontrada" });
  if (collection.state === "published") return reply.code(409).send({ error: "Retire a coleção da home antes de excluí-la" });
  await prisma.$transaction([
    prisma.auditLog.create({ data: { actorAccountId: identity.accountId, action: "editorial_collection.deleted", targetType: "editorial_collection", targetId: id, beforeValue: jsonValue(collectionAuditValue(collection, collection.items.map((item) => item.workId))) } }),
    prisma.editorialCollection.delete({ where: { id } }),
  ]);
  return reply.code(204).send();
});
app.get("/api/admin/audit", async (request) => {
  const query = request.query as { targetId?: string };
  return toJson(await prisma.auditLog.findMany({
    where: query.targetId ? { targetId: query.targetId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { username: true, role: true } } },
  }));
});
app.post("/api/admin/publications/:id/retry", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const publication = await prisma.publication.findUnique({ where: { id }, include: { files: { select: { receivedAt: true } }, receipt: { select: { id: true } } } });
  if (!publication) return reply.code(404).send({ error: "Publicação não encontrada" });
  if (publication.receipt) return reply.code(409).send({ error: "Publicação já confirmada" });
  if (publication.state !== "failed") return reply.code(409).send({ error: "Somente publicações com falha podem ser reenfileiradas" });
  if (publication.files.some((file) => !file.receivedAt)) return reply.code(409).send({ error: "Publicação ainda possui arquivos pendentes" });
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
    }
  });
  return queued.count ? reply.code(202).send({ id, state: "validating" }) : reply.code(409).send({ error: "Estado da publicação foi alterado" });
});
app.get("/api/admin/accounts", async (request, reply) => {
  if (!requireOwner(request, reply)) return;
  return prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, role: true, disabled: true, createdAt: true, updatedAt: true, _count: { select: { profiles: true } } }
  });
});
app.post("/api/admin/accounts", async (request, reply) => {
  if (!requireOwner(request, reply)) return;
  const body = request.body as { username?: string; password?: string; role?: string };
  const username = normalizeUsername(body?.username);
  if (!username) return reply.code(400).send({ error: "Usuário deve ter entre 3 e 64 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado" });
  if (!body?.password || body.password.length < 4) return reply.code(400).send({ error: "Senha deve ter pelo menos 4 caracteres" });
  const role = body.role === "admin" || body.role === "viewer" ? body.role : null;
  if (!role) return reply.code(400).send({ error: "Função deve ser admin ou viewer" });
  const passwordHash = await hashPassword(body.password);
  try {
    const account = await prisma.account.create({ data: { username, passwordHash, role } });
    await ensureDefaultProfile(account.id, account.role);
    return reply.code(201).send({ id: account.id, username: account.username, role: account.role, disabled: account.disabled, createdAt: account.createdAt });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return reply.code(409).send({ error: "Usuário já existe" });
    throw error;
  }
});
app.patch("/api/admin/accounts/:id", async (request, reply) => {
  if (!requireOwner(request, reply)) return;
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  const body = request.body as { role?: string; disabled?: boolean; password?: string };
  if (id === identity.accountId && (body.disabled === true || (body.role && body.role !== "owner"))) {
    return reply.code(409).send({ error: "A conta owner ativa não pode desativar ou rebaixar a si própria" });
  }
  const role = body.role === undefined ? undefined : body.role === "admin" || body.role === "viewer" ? body.role : null;
  if (role === null) return reply.code(400).send({ error: "Função inválida" });
  if (body.password !== undefined && body.password.length < 4) return reply.code(400).send({ error: "Senha deve ter pelo menos 4 caracteres" });
  const account = await prisma.account.findUnique({ where: { id }, select: { role: true } });
  if (!account) return reply.code(404).send({ error: "Conta não encontrada" });
  if (account.role === "owner" && id !== identity.accountId) return reply.code(403).send({ error: "Outra conta owner não pode ser alterada" });
  const updated = await prisma.account.update({ where: { id }, data: {
    ...(role ? { role } : {}),
    ...(typeof body.disabled === "boolean" ? { disabled: body.disabled } : {}),
    ...(body.password ? { passwordHash: await hashPassword(body.password) } : {})
  }, select: { id: true, username: true, role: true, disabled: true, updatedAt: true } });
  return updated;
});
app.get("/api/admin/revisions", async () => {
  const revisions = await prisma.revision.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { publication: { select: { packageId: true, packageType: true, state: true, receipt: { select: { status: true } } } } }
  });
  return toJson(revisions.map((revision) => {
    const snapshot = manifestSchema.safeParse(revision.snapshot);
    return {
      id: revision.id,
      scopeKey: revision.scopeKey,
      number: revision.number,
      active: revision.active,
      createdAt: revision.createdAt,
      packageId: revision.publication.packageId,
      packageType: revision.publication.packageType,
      publicationState: revision.publication.state,
      receiptStatus: revision.publication.receipt?.status ?? null,
      workTitle: snapshot.success ? snapshot.data.work.title : "Manifesto inválido",
      seasonTitle: snapshot.success ? snapshot.data.season?.title ?? null : null,
      episodeTitle: snapshot.success ? snapshot.data.episodes[0]?.title ?? null : null,
      episodeNumber: snapshot.success ? snapshot.data.episodes[0]?.number ?? null : null
    };
  }));
});
app.post("/api/admin/revisions/:id/activate", async (request, reply) => {
  const revision = await prisma.revision.findUnique({
    where: { id: (request.params as { id: string }).id },
    include: { publication: { select: { state: true } } }
  });
  if (!revision) return reply.code(404).send({ error: "Revisão não encontrada" });
  if (revision.publication.state !== "confirmed") return reply.code(409).send({ error: "Somente revisões confirmadas podem ser ativadas" });
  if (revision.active) return reply.code(204).send();
  const targetManifest = manifestSchema.parse(revision.snapshot);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${revision.scopeKey}))`;
    await tx.revision.updateMany({ where: { scopeKey: revision.scopeKey, active: true }, data: { active: false } });
    await tx.revision.update({ where: { id: revision.id }, data: { active: true } });

    if (targetManifest.package_type === "season") {
      const season = await tx.season.findUnique({ where: { stableId: targetManifest.season!.id } });
      if (!season) throw new Error("Temporada da revisão não encontrada");
      const history = await tx.revision.findMany({
        where: { scopeKey: revision.scopeKey, number: { lte: revision.number } },
        orderBy: { number: "asc" }
      });
      const episodeState = new Map<string, { revisionId: string; item: PackageManifest["episodes"][number] }>();
      for (const historicalRevision of history) {
        const manifest = manifestSchema.parse(historicalRevision.snapshot);
        for (const item of manifest.episodes) episodeState.set(item.id, { revisionId: historicalRevision.id, item });
      }
      await tx.season.update({
        where: { id: season.id },
        data: {
          activeRevisionId: revision.id,
          number: targetManifest.season!.number,
          title: targetManifest.season!.title,
          metadata: jsonValue(targetManifest.season!.metadata),
          completeness: jsonValue(targetManifest.season!.publication_completeness)
        }
      });
      await tx.episode.updateMany({ where: { seasonId: season.id }, data: { activeRevisionId: null } });
      for (const [stableId, state] of episodeState) {
        await tx.episode.updateMany({
          where: { stableId, seasonId: season.id },
          data: {
            activeRevisionId: state.revisionId,
            number: state.item.number,
            absoluteNumber: state.item.absolute_number,
            title: state.item.title,
            synopsis: readMetadataString(state.item.metadata, "synopsis") ?? readMetadataString(state.item.metadata, "overview"),
            metadata: jsonValue({ ...state.item.metadata, delivery: state.item.delivery }),
            markers: jsonValue(state.item.markers),
            sourceSha256: state.item.source_sha256,
            mediaManifest: state.item.media_manifest
          }
        });
      }
      if (episodeState.size) {
        await tx.revision.updateMany({
          where: { scopeKey: { in: [...episodeState.keys()].map((stableId) => `episode:${stableId}`) }, active: true },
          data: { active: false }
        });
      }
    } else if (targetManifest.package_type === "episode_replacement") {
      const item = targetManifest.episodes[0];
      const season = await tx.season.findUnique({ where: { stableId: targetManifest.season!.id } });
      if (!season) throw new Error("Temporada da substituição não encontrada");
      await tx.episode.updateMany({
        where: { stableId: item.id, seasonId: season.id },
        data: {
          activeRevisionId: revision.id,
          number: item.number,
          absoluteNumber: item.absolute_number,
          title: item.title,
          synopsis: readMetadataString(item.metadata, "synopsis") ?? readMetadataString(item.metadata, "overview"),
          metadata: jsonValue({ ...item.metadata, delivery: item.delivery }),
          markers: jsonValue(item.markers),
          sourceSha256: item.source_sha256,
          mediaManifest: item.media_manifest
        }
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
  return reply.code(204).send();
});
app.get("/api/admin/revision-cleanup", async () => {
  const [candidates, jobs] = await Promise.all([
    findRevisionCleanupCandidates(env.revisionRetentionDays, env.revisionKeepPerScope),
    prisma.revisionCleanupJob.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return toJson({
    policy: { retentionDays: env.revisionRetentionDays, keepPerScope: env.revisionKeepPerScope },
    candidates,
    jobs,
  });
});
app.post("/api/admin/revision-cleanup", async (request, reply) => {
  const identity = sessionIdentity(request);
  const requested = Array.isArray((request.body as { publicationIds?: unknown })?.publicationIds)
    ? (request.body as { publicationIds: unknown[] }).publicationIds.filter((id): id is string => typeof id === "string").slice(0, 100)
    : [];
  if (!requested.length) return reply.code(400).send({ error: "Selecione ao menos uma publicação elegível" });
  const candidates = await findRevisionCleanupCandidates(env.revisionRetentionDays, env.revisionKeepPerScope);
  const byId = new Map(candidates.map((candidate) => [candidate.publicationId, candidate]));
  const accepted = Array.from(new Set(requested)).flatMap((id) => byId.get(id) ?? []);
  if (!accepted.length) return reply.code(409).send({ error: "As publicações selecionadas não são mais elegíveis" });
  await prisma.$transaction(async (tx) => {
    await tx.revisionCleanupJob.createMany({
      data: accepted.map((candidate) => ({
        publicationId: candidate.publicationId,
        requestedByAccountId: identity.accountId,
        sizeBytes: candidate.sizeBytes,
      })),
      skipDuplicates: true,
    });
    await tx.auditLog.create({ data: {
      actorAccountId: identity.accountId,
      action: "revision_cleanup.queued",
      targetType: "publication",
      targetId: accepted.map((candidate) => candidate.publicationId).join(",").slice(0, 2_000),
      afterValue: jsonValue({ publicationIds: accepted.map((candidate) => candidate.publicationId) }),
    } });
  });
  return reply.code(202).send({ queued: accepted.length });
});
app.post("/api/admin/revision-cleanup/:id/retry", async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const result = await prisma.revisionCleanupJob.updateMany({ where: { id, state: "failed" }, data: { state: "queued", attempts: 0, error: null, workerId: null, leaseUntil: null } });
  return result.count ? reply.code(202).send({ id, state: "queued" }) : reply.code(409).send({ error: "Job não está em falha" });
});

// A season manifest inventories every HLS segment and can legitimately exceed the
// small global JSON limit. Keep the exception scoped to publication negotiation.
app.post("/v1/publications", { bodyLimit: env.manifestBodyLimitBytes }, async (request, reply) => {
  const body = request.body as { package_id?: string; idempotency_key?: string; manifest_sha256?: string; total_size_bytes?: number; manifest?: unknown };
  const parsed = manifestSchema.safeParse(body?.manifest);
  if (!parsed.success) return reply.code(400).send({ error: "Manifest inválido", details: parsed.error.flatten() });
  const manifest = parsed.data;
  if (body.package_id !== manifest.package_id || body.idempotency_key !== manifest.idempotency_key || body.manifest_sha256 !== manifest.manifest_sha256) return reply.code(409).send({ error: "Envelope e manifesto divergem" });
  const calculatedHash = manifestHash(manifest as unknown as Record<string, unknown>);
  if (calculatedHash !== manifest.manifest_sha256) return reply.code(409).send({ error: "manifest_sha256 não confere", expected: manifest.manifest_sha256, calculated: calculatedHash });
  const totalSize = Number(body.total_size_bytes);
  if (!Number.isSafeInteger(totalSize) || totalSize <= 0 || totalSize > env.maxPackageSizeBytes) return reply.code(413).send({ error: "Tamanho total do pacote inválido" });
  const expectedPaths = ["manifest.json", "checksums.sha256", ...manifest.assets.map((asset) => asset.path)];
  if (expectedPaths.length > env.maxPackageFiles) return reply.code(413).send({ error: "Pacote excede o limite de arquivos" });
  if (new Set(expectedPaths).size !== expectedPaths.length) return reply.code(400).send({ error: "Caminho duplicado no pacote" });
  const existing = await prisma.publication.findUnique({ where: { idempotencyKey: manifest.idempotency_key } });
  if (existing) {
    if (existing.manifestSha256 !== manifest.manifest_sha256 || existing.packageId !== manifest.package_id) return reply.code(409).send({ error: "Idempotency key já usada com outro pacote" });
    return publicationStatus(existing.id, reply);
  }
  const samePackage = await prisma.publication.findUnique({ where: { packageId: manifest.package_id } });
  if (samePackage) return reply.code(409).send({ error: "package_id já utilizado" });
  const uploadId = `upl_${crypto.randomUUID()}`;
  const assetByPath = new Map(manifest.assets.map((asset) => [asset.path, asset]));
  const publication = await prisma.$transaction(async (tx) => {
    const created = await tx.publication.create({ data: {
      uploadId, packageId: manifest.package_id, idempotencyKey: manifest.idempotency_key,
      packageType: manifest.package_type, manifestSha256: manifest.manifest_sha256,
      manifest: jsonValue(manifest), totalSizeBytes: BigInt(totalSize)
    } });
    const records = expectedPaths.map((relativePath) => { const asset = assetByPath.get(relativePath); return {
      publicationId: created.id, relativePath, expectedSha256: asset?.sha256,
      expectedBytes: asset ? BigInt(asset.size_bytes) : undefined
    }; });
    for (const rows of chunks(records, 1000)) await tx.publicationFile.createMany({ data: rows });
    return created;
  }, { timeout: 60_000 });
  try {
    const directories = new Set(expectedPaths.map((relativePath) =>
      path.dirname(safeDataPath("staging", uploadId, "files", relativePath))));
    await Promise.all([...directories].map((directory) => ensureUploadDirectory(directory)));
  }
  catch (error) { await prisma.publication.delete({ where: { id: publication.id } }); throw error; }
  return publicationStatus(publication.id, reply);
});

app.get("/v1/publications/:uploadId", async (request, reply) => {
  const publication = await prisma.publication.findUnique({ where: { uploadId: (request.params as { uploadId: string }).uploadId } });
  return publication ? publicationStatus(publication.id, reply) : reply.code(404).send({ error: "Publicação não encontrada" });
});
app.delete("/v1/publications/:uploadId", async (request, reply) => {
  const uploadId = (request.params as { uploadId: string }).uploadId;
  const publication = await prisma.publication.findUnique({
    where: { uploadId }, select: { id: true, packageId: true, manifestSha256: true, state: true }
  });
  if (!publication) return reply.code(404).send({ error: "Publicação não encontrada" });
  const packageId = request.headers["x-package-id"]?.toString() ?? "";
  const manifestSha256 = request.headers["x-manifest-sha256"]?.toString().toLowerCase() ?? "";
  if (packageId !== publication.packageId || manifestSha256 !== publication.manifestSha256) {
    return reply.code(409).send({ error: "Confirmação do pacote não confere" });
  }
  if (publication.state === "confirmed") {
    return reply.code(409).send({ error: "Publicação confirmada só pode ser excluída pelo painel administrativo" });
  }
  try {
    await deletePublicationCompletely(publication.id, packageId);
    return reply.code(204).send();
  } catch (error) {
    if (error instanceof PublicationDeletionConflict) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    throw error;
  }
});

// application/octet-stream is kept as a Readable and piped directly to disk. The
// route limit protects capacity without forcing Fastify to buffer the file in RAM.
app.put("/v1/publications/:uploadId/files/*", { bodyLimit: env.maxUploadSizeBytes }, async (request, reply) => {
  const { uploadId } = request.params as { uploadId: string };
  let relativePath: string;
  try { relativePath = decodeURIComponent((request.params as Record<string, string>)["*"] ?? ""); }
  catch { return reply.code(400).send({ error: "Caminho inválido" }); }
  if (!isSafeRelativePath(relativePath)) return reply.code(400).send({ error: "Caminho inválido" });
  const publication = await prisma.publication.findUnique({
    where: { uploadId }, select: { id: true, uploadId: true, state: true }
  });
  if (!publication) return reply.code(404).send({ error: "Publicação não encontrada" });
  if (["validating", "promoting", "confirmed"].includes(publication.state)) return reply.code(409).send({ error: "Publicação não aceita novos arquivos neste estado" });
  const file = await prisma.publicationFile.findUnique({
    where: { publicationId_relativePath: { publicationId: publication.id, relativePath } }
  });
  if (!file) return reply.code(404).send({ error: "Arquivo não esperado" });
  const expectedHeader = request.headers["x-content-sha256"]?.toString().toLowerCase();
  if (!expectedHeader?.match(/^[a-f0-9]{64}$/)) return reply.code(400).send({ error: "X-Content-SHA256 obrigatório" });
  const declaredBytes = Number(request.headers["content-length"]);
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > env.maxUploadSizeBytes) return reply.code(413).send({ error: "Content-Length inválido ou acima do limite" });
  if (file.expectedBytes !== null && BigInt(declaredBytes) !== file.expectedBytes) return reply.code(409).send({ error: "Tamanho não confere com o manifesto" });
  if (file.expectedSha256 && expectedHeader !== file.expectedSha256) return reply.code(409).send({ error: "Hash declarado não confere com o manifesto" });
  // A proxy can lose the response after the file and database update completed.
  // Retrying the same idempotent PUT must then finish immediately instead of
  // writing and hashing the segment again.
  if (file.receivedAt && file.receivedSha256 === expectedHeader &&
      file.receivedBytes === BigInt(declaredBytes)) {
    return { upload_id: publication.uploadId, state: "uploading",
      received_path: relativePath, already_received: true };
  }
  const uploadKey = `${publication.id}:${relativePath}`;
  if (activeUploads.has(uploadKey)) {
    return reply.header("Retry-After", "2").code(425).send({
      error: "Este arquivo já está sendo recebido", relativePath
    });
  }
  activeUploads.add(uploadKey);
  try {
    const destination = safeDataPath("staging", uploadId, "files", relativePath);
    const temporary = `${destination}.tmp-${crypto.randomUUID()}`;
    await ensureUploadDirectory(path.dirname(destination));
    const hash = crypto.createHash("sha256");
    let bytes = 0;
    const limiter = new Transform({ transform(chunk: Buffer, _encoding, callback) { bytes += chunk.length; if (bytes > declaredBytes || bytes > env.maxUploadSizeBytes) callback(new Error("Upload excedeu o tamanho declarado")); else { hash.update(chunk); callback(null, chunk); } } });
    try {
      const stream = request.body instanceof Readable ? request.body : request.raw;
      await pipeline(stream, limiter, fs.createWriteStream(temporary, { flags: "wx" }));
      const receivedSha256 = hash.digest("hex");
      if (bytes !== declaredBytes) throw new UploadConflict("Tamanho recebido não confere com Content-Length");
      if (receivedSha256 !== expectedHeader || (file.expectedSha256 && receivedSha256 !== file.expectedSha256)) throw new UploadConflict("SHA-256 recebido não confere");
      await fs.promises.rm(destination, { force: true });
      await fs.promises.rename(temporary, destination);
      await prisma.publicationFile.update({
        where: { id: file.id },
        data: { receivedSha256, receivedBytes: BigInt(bytes), receivedAt: new Date() }
      });
    } catch (error) {
      await fs.promises.rm(temporary, { force: true });
      if (error instanceof UploadConflict) return reply.code(409).send({ error: error.message, relativePath, receivedBytes: bytes });
      throw error;
    }
    return { upload_id: publication.uploadId, state: "uploading", received_path: relativePath };
  } finally {
    activeUploads.delete(uploadKey);
  }
});

app.post("/v1/publications/:uploadId/complete", async (request, reply) => {
  const { uploadId } = request.params as { uploadId: string };
  const publication = await prisma.publication.findUnique({ where: { uploadId }, include: { files: true, receipt: true } });
  if (!publication) return reply.code(404).send({ error: "Publicação não encontrada" });
  if (publication.receipt) return publicationStatus(publication.id, reply);
  if (["validating", "promoting"].includes(publication.state)) {
    return publicationStatus(publication.id, reply.code(202));
  }
  const missing = publication.files.filter((file) => !file.receivedAt).map((file) => file.relativePath);
  if (missing.length) return reply.code(409).send({ error: "Arquivos pendentes", missing_paths: missing });
  const receivedTotal = publication.files.reduce((sum, file) => sum + (file.receivedBytes ?? 0n), 0n);
  if (publication.totalSizeBytes === null || receivedTotal !== publication.totalSizeBytes) {
    return reply.code(409).send({ error: "Tamanho total recebido diverge do tamanho declarado",
      declared_bytes: publication.totalSizeBytes?.toString(), received_bytes: receivedTotal.toString() });
  }
  const claimed = await prisma.publication.updateMany({
    where: { id: publication.id, state: { in: ["waiting_files", "uploading", "ready", "failed"] } },
    data: {
      state: "validating",
      errorMessage: null,
      finalizationAttempts: 0,
      finalizationWorkerId: null,
      finalizationLeaseUntil: null,
      finalizationHeartbeatAt: null,
      finalizationNextAttemptAt: null,
    }
  });
  if (!claimed.count) {
    const current = await prisma.publication.findUnique({ where: { id: publication.id }, select: { state: true } });
    return publicationStatus(
      publication.id,
      reply.code(current && ["validating", "promoting"].includes(current.state) ? 202 : 200)
    );
  }
  return publicationStatus(publication.id, reply.code(202));
});

async function publicationStatus(publicationId: string, reply: FastifyReply) {
  const publication = await prisma.publication.findUnique({ where: { id: publicationId }, include: { files: true, receipt: true } });
  if (!publication) return reply.code(404).send({ error: "Publicação não encontrada" });
  return toJson({ upload_id: publication.uploadId, state: publication.state, error: publication.errorMessage, missing_paths: publication.files.filter((item) => !item.receivedAt).map((item) => item.relativePath), received_paths: publication.files.filter((item) => item.receivedAt).map((item) => item.relativePath), receipt: publication.receipt ? {
    publication_id: publication.receipt.publicationId, package_id: publication.receipt.packageId, remote_work_id: publication.receipt.remoteWorkId,
    remote_season_id: publication.receipt.remoteSeasonId, remote_episode_ids: publication.receipt.remoteEpisodeIds,
    remote_revision: publication.receipt.remoteRevision, manifest_sha256: publication.receipt.manifestSha256,
    status: publication.receipt.status, confirmed_at: publication.receipt.confirmedAt
  } : null });
}

class PublicationDeletionConflict extends Error {
  constructor(message: string, readonly statusCode = 409) { super(message); }
}

async function deletePublicationCompletely(publicationId: string, expectedPackageId: string,
                                           actorAccountId?: string) {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    include: { revisions: { select: { id: true, active: true } } }
  });
  if (!publication) throw new PublicationDeletionConflict("Publicação não encontrada", 404);
  if (publication.packageId !== expectedPackageId) {
    throw new PublicationDeletionConflict("O package_id digitado não corresponde à publicação");
  }
  if ([...activeUploads].some((key) => key.startsWith(`${publication.id}:`))) {
    throw new PublicationDeletionConflict("Há um arquivo deste pacote sendo recebido; aguarde e tente novamente");
  }
  if (["validating", "promoting"].includes(publication.state)) {
    throw new PublicationDeletionConflict("A publicação está sendo finalizada e não pode ser excluída agora");
  }
  const revisionIds = publication.revisions.map((revision) => revision.id);
  if (publication.revisions.some((revision) => revision.active)) {
    throw new PublicationDeletionConflict(
      "Este pacote contém uma revisão ativa. Ative outra revisão antes de excluí-lo.");
  }
  if (revisionIds.length) {
    const [seasonReferences, episodeReferences] = await Promise.all([
      prisma.season.count({ where: { activeRevisionId: { in: revisionIds } } }),
      prisma.episode.count({ where: { activeRevisionId: { in: revisionIds } } }),
    ]);
    if (seasonReferences || episodeReferences) {
      throw new PublicationDeletionConflict(
        "Este pacote ainda é usado pelo catálogo. Ative outra revisão antes de excluí-lo.");
    }
  }

  const sources = [
    { name: "staging", path: safeDataPath("staging", publication.uploadId) },
    { name: "library", path: safeDataPath("library", "publications", publication.id) },
  ];
  const trashRoot = safeDataPath("trash", "publication-deletions", crypto.randomUUID());
  const moved: Array<{ source: string; trash: string }> = [];
  await fs.promises.mkdir(trashRoot, { recursive: true });
  try {
    for (const source of sources) {
      if (!await directoryExists(source.path)) continue;
      const trash = path.join(trashRoot, source.name);
      await fs.promises.rename(source.path, trash);
      moved.push({ source: source.path, trash });
    }
    await prisma.$transaction(async (tx) => {
      await tx.revisionCleanupJob.deleteMany({ where: { publicationId: publication.id } });
      await tx.asset.deleteMany({ where: { publicationId: publication.id } });
      await tx.mediaObject.deleteMany({ where: { publicationId: publication.id } });
      if (actorAccountId) {
        await tx.auditLog.create({ data: {
          actorAccountId, action: "publication.deleted", targetType: "publication",
          targetId: publication.packageId,
          beforeValue: jsonValue({ id: publication.id, uploadId: publication.uploadId,
            packageId: publication.packageId, state: publication.state,
            totalSizeBytes: publication.totalSizeBytes?.toString() ?? null }),
          afterValue: jsonValue({ deleted: true }),
        } });
      }
      await tx.publication.delete({ where: { id: publication.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
  } catch (error) {
    for (const item of moved.reverse()) {
      if (!await directoryExists(item.source) && await directoryExists(item.trash)) {
        await fs.promises.mkdir(path.dirname(item.source), { recursive: true });
        await fs.promises.rename(item.trash, item.source);
      }
    }
    await fs.promises.rm(trashRoot, { recursive: true, force: true });
    throw error;
  }
  await fs.promises.rm(trashRoot, { recursive: true, force: true }).catch((error) => {
    app.log.error({ err: error, publicationId }, "publication trash cleanup failed");
  });
  return { deleted: true, publicationId: publication.id, packageId: publication.packageId };
}

class WorkDeletionConflict extends Error {
  constructor(message: string, readonly statusCode = 409) { super(message); }
}

type WorkDeletionState = Awaited<ReturnType<typeof loadWorkDeletionState>>;

async function loadWorkDeletionState(workId: string) {
  const work = await prisma.work.findUnique({
    where: { id: workId },
    include: {
      _count: { select: { seasons: true, episodes: true } },
      seasons: { select: { id: true, episodes: { select: { id: true } } } }
    }
  });
  if (!work) return null;
  const seasonIds = work.seasons.map((season) => season.id);
  const episodeIds = work.seasons.flatMap((season) => season.episodes.map((episode) => episode.id));
  const publicationWhere: Prisma.PublicationWhereInput = {
    OR: [
      { receipt: { remoteWorkId: work.id } },
      { assets: { some: { workId: work.id } } },
      { mediaObjects: { some: { workId: work.id } } },
      { manifest: { path: ["work", "id"], equals: work.stableId } }
    ]
  };
  const publications = await prisma.publication.findMany({
    where: publicationWhere,
    orderBy: { createdAt: "asc" },
    select: {
      id: true, uploadId: true, packageId: true, packageType: true, state: true,
      totalSizeBytes: true, errorMessage: true, createdAt: true,
      revisions: { select: { id: true, scopeKey: true, number: true, active: true } },
      receipt: { select: { status: true } },
      _count: { select: { files: true } }
    }
  });
  const publicationIds = publications.map((publication) => publication.id);
  const pathHints = publicationIds.map((id) => path.join("library", "publications", id));
  const transcodeJobs = pathHints.length
    ? await prisma.transcodeJob.findMany({
        where: { OR: pathHints.map((hint) => ({ sourcePath: { contains: hint } })) },
        select: { id: true, state: true, outputPath: true, sizeBytes: true }
      })
    : [];
  const transcodeIds = transcodeJobs.map((job) => job.id);
  const assetWhere: Prisma.AssetWhereInput = { OR: [
    { workId: work.id },
    { publicationId: { in: publicationIds } },
    { seasonId: { in: seasonIds } },
    { episodeId: { in: episodeIds } }
  ] };
  const mediaWhere: Prisma.MediaObjectWhereInput = { OR: [
    { workId: work.id },
    { publicationId: { in: publicationIds } },
    { episodeId: { in: episodeIds } }
  ] };
  const [assets, mediaObjects, favorites, progress, collectionItems, cleanupJobs] = await Promise.all([
    prisma.asset.aggregate({ where: assetWhere, _count: { _all: true } }),
    prisma.mediaObject.aggregate({ where: mediaWhere, _count: { _all: true } }),
    prisma.favorite.count({ where: { workId: work.id } }),
    prisma.viewingProgress.count({ where: { OR: [{ workId: work.id }, { episode: { workId: work.id } }] } }),
    prisma.editorialCollectionItem.count({ where: { workId: work.id } }),
    publicationIds.length
      ? prisma.revisionCleanupJob.findMany({
          where: { publicationId: { in: publicationIds }, state: { in: ["queued", "processing"] } },
          select: { id: true, state: true, publicationId: true }
        })
      : Promise.resolve([])
  ]);
  const blockers: string[] = [];
  const unsafePublications = publications.filter((publication) => ["waiting_files", "uploading", "validating", "promoting"].includes(publication.state));
  if (unsafePublications.length) {
    blockers.push(`${unsafePublications.length} publicação(ões) em envio ou finalização. Conclua ou exclua esses pacotes antes de apagar a obra.`);
  }
  if ([...activeUploads].some((key) => publicationIds.some((id) => key.startsWith(`${id}:`)))) {
    blockers.push("Há arquivos sendo recebidos para esta obra. Aguarde o envio terminar.");
  }
  if (cleanupJobs.length) {
    blockers.push("Há uma limpeza de revisão na fila ou em andamento para esta obra. Aguarde a conclusão.");
  }
  if (transcodeJobs.some((job) => ["queued", "processing"].includes(job.state))) {
    blockers.push("Há um transcode na fila ou em processamento para esta obra. Aguarde a conclusão.");
  }
  return {
    work, publications, transcodeJobs, blockers, assetWhere, mediaWhere,
    counts: {
      seasons: work._count.seasons,
      episodes: work._count.episodes,
      assets: assets._count._all,
      mediaObjects: mediaObjects._count._all,
      favorites,
      progress,
      collectionItems,
      publications: publications.length,
      transcodeJobs: transcodeJobs.length,
      bytes: publications.reduce((total, publication) => total + Number(publication.totalSizeBytes ?? 0n), 0)
        + transcodeJobs.reduce((total, job) => total + Number(job.sizeBytes ?? 0n), 0)
    }
  };
}

function workDeletionPreview(state: NonNullable<WorkDeletionState>) {
  return {
    work: {
      id: state.work.id,
      stableId: state.work.stableId,
      title: state.work.title.trim(),
      contentKind: state.work.contentKind
    },
    counts: state.counts,
    blockers: state.blockers,
    canDelete: state.blockers.length === 0,
    publications: state.publications.map((publication) => ({
      id: publication.id,
      packageId: publication.packageId,
      packageType: publication.packageType,
      state: publication.state,
      receiptStatus: publication.receipt?.status ?? null,
      revisions: publication.revisions,
      fileCount: publication._count.files,
      totalSizeBytes: Number(publication.totalSizeBytes ?? 0n)
    })),
    transcodeJobs: state.transcodeJobs.map((job) => ({
      id: job.id,
      state: job.state,
      sizeBytes: Number(job.sizeBytes ?? 0n)
    }))
  };
}

async function deleteWorkCompletely(workId: string, expectedTitle: string, actorAccountId: string) {
  const state = await loadWorkDeletionState(workId);
  if (!state) throw new WorkDeletionConflict("Obra não encontrada", 404);
  if (state.work.title.trim() !== expectedTitle) {
    throw new WorkDeletionConflict("O título digitado não corresponde ao título canônico da obra");
  }
  if (state.blockers.length) throw new WorkDeletionConflict(state.blockers.join(" "));

  const publicationIds = state.publications.map((publication) => publication.id);
  const transcodeIds = state.transcodeJobs.map((job) => job.id);
  const dataRoot = path.resolve(env.dataRoot);
  const sources = [
    ...state.publications.flatMap((publication) => [
      safeDataPath("staging", publication.uploadId),
      safeDataPath("library", "publications", publication.id)
    ]),
    ...state.transcodeJobs.map((job) => job.outputPath).filter((value) => {
      const target = path.resolve(value);
      return target.startsWith(dataRoot + path.sep);
    })
  ].filter((value, index, all) => all.indexOf(value) === index);
  const trashRoot = safeDataPath("trash", "work-deletions", crypto.randomUUID());
  const moved: Array<{ source: string; trash: string }> = [];
  await fs.promises.mkdir(trashRoot, { recursive: true });
  try {
    for (const [index, source] of sources.entries()) {
      const stat = await fs.promises.stat(source).catch(() => null);
      if (!stat) continue;
      const trash = path.join(trashRoot, `${index}-${path.basename(source)}`);
      await fs.promises.rename(source, trash);
      moved.push({ source, trash });
    }
    await prisma.$transaction(async (tx) => {
      if ([...activeUploads].some((key) => publicationIds.some((id) => key.startsWith(`${id}:`)))) {
        throw new WorkDeletionConflict("Há arquivos sendo recebidos para esta obra.");
      }
      if (publicationIds.length) {
        const unsafe = await tx.publication.count({
          where: { id: { in: publicationIds }, state: { in: ["waiting_files", "uploading", "validating", "promoting"] } }
        });
        if (unsafe) throw new WorkDeletionConflict("Uma publicação desta obra começou a ser enviada ou finalizada.");
        const activeCleanup = await tx.revisionCleanupJob.count({
          where: { publicationId: { in: publicationIds }, state: { in: ["queued", "processing"] } }
        });
        if (activeCleanup) throw new WorkDeletionConflict("Uma limpeza de revisão desta obra começou a ser processada.");
        await tx.revisionCleanupJob.deleteMany({ where: { publicationId: { in: publicationIds } } });
        await tx.asset.deleteMany({ where: state.assetWhere });
        await tx.mediaObject.deleteMany({ where: state.mediaWhere });
        await tx.publication.deleteMany({ where: { id: { in: publicationIds } } });
      } else {
        await tx.asset.deleteMany({ where: state.assetWhere });
        await tx.mediaObject.deleteMany({ where: state.mediaWhere });
      }
      if (transcodeIds.length) {
        const activeTranscode = await tx.transcodeJob.count({
          where: { id: { in: transcodeIds }, state: { in: ["queued", "processing"] } }
        });
        if (activeTranscode) throw new WorkDeletionConflict("Um transcode desta obra começou a ser processado.");
        await tx.transcodeJob.deleteMany({ where: { id: { in: transcodeIds } } });
      }
      await tx.auditLog.create({ data: {
        actorAccountId,
        action: "work.deleted",
        targetType: "work",
        targetId: state.work.stableId,
        beforeValue: jsonValue({
          id: state.work.id,
          stableId: state.work.stableId,
          title: state.work.title,
          contentKind: state.work.contentKind,
          counts: state.counts,
          publications: state.publications.map((publication) => ({
            id: publication.id, packageId: publication.packageId, packageType: publication.packageType
          }))
        }),
        afterValue: jsonValue({ deleted: true })
      } });
      await tx.work.delete({ where: { id: state.work.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
  } catch (error) {
    for (const item of moved.reverse()) {
      const stillMissing = !(await fs.promises.stat(item.source).catch(() => null));
      if (stillMissing) {
        await fs.promises.mkdir(path.dirname(item.source), { recursive: true });
        await fs.promises.rename(item.trash, item.source).catch(() => undefined);
      }
    }
    await fs.promises.rm(trashRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  await fs.promises.rm(trashRoot, { recursive: true, force: true }).catch((error) => {
    app.log.error({ err: error, workId }, "work deletion trash cleanup failed");
  });
  return {
    deleted: true,
    workId: state.work.id,
    stableId: state.work.stableId,
    title: state.work.title,
    counts: state.counts,
    publicationIds
  };
}

function safeDataPath(...parts: string[]): string {
  const root = path.resolve(env.dataRoot);
  const target = path.resolve(root, ...parts.flatMap((part) => part.replaceAll("\\", "/").split("/")));
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("Caminho fora de DATA_ROOT");
  return target;
}
function stagingFilesRoot(uploadId: string): string { return safeDataPath("staging", uploadId, "files"); }
function ensureUploadDirectory(directory: string): Promise<void> {
  const key = path.resolve(directory);
  const existing = uploadDirectories.get(key);
  if (existing) return existing;
  const creating = fs.promises.mkdir(key, { recursive: true }).then(() => undefined);
  uploadDirectories.set(key, creating);
  creating.catch(() => {
    if (uploadDirectories.get(key) === creating) uploadDirectories.delete(key);
  });
  return creating;
}
async function directoryExists(value: string): Promise<boolean> { try { return (await fs.promises.stat(value)).isDirectory(); } catch { return false; } }
async function cleanupUploadTemporaries(): Promise<void> {
  const root = safeDataPath("staging");
  if (!await directoryExists(root)) return;
  const cutoff = Date.now() - 60 * 60_000;
  async function walk(current: string): Promise<void> {
    for (const entry of await fs.promises.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() && entry.name.includes(".tmp-") && (await fs.promises.stat(absolute)).mtimeMs < cutoff) await fs.promises.rm(absolute, { force: true });
    }
  }
  await walk(root);
}
function readNestedArray(value: unknown, key: string): unknown[] { if (!value || typeof value !== "object") return []; const nested = (value as Record<string, unknown>)[key]; return Array.isArray(nested) ? nested : []; }
function readNestedObject(value: unknown, key: string): Record<string, unknown> | null { const object = readObject(value); return readObject(object[key]); }
function readObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function readMetadataString(value: unknown, key: string): string | null { if (!value || typeof value !== "object") return null; const nested = (value as Record<string, unknown>)[key]; return typeof nested === "string" && nested.trim() ? nested : null; }
function parseContentKind(value: unknown): "movie" | "series" | "anime" | undefined { return value === "movie" || value === "series" || value === "anime" ? value : undefined; }
function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return /^[a-z0-9._-]{3,64}$/.test(username) ? username : null;
}
type AdminEventSnapshot = {
  publications: string;
  transcodes: string;
  revisions: string;
  accounts: string;
  integrity: string;
  catalog: string;
  cleanup: string;
};
async function readAdminEventSnapshot(): Promise<AdminEventSnapshot> {
  const [publications, transcodes, revisions, accounts, integrity, catalog, collections, cleanup] = await Promise.all([
    prisma.publication.aggregate({ _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.transcodeJob.aggregate({ _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.revision.findMany({ select: { id: true, active: true }, orderBy: { id: "asc" } }),
    prisma.account.aggregate({ _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.integrityCheck.aggregate({ _max: { completedAt: true, startedAt: true }, _count: { _all: true } }),
    prisma.editorialOverride.aggregate({ _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.editorialCollection.aggregate({ _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.revisionCleanupJob.aggregate({ _max: { updatedAt: true }, _count: { _all: true } }),
  ]);
  return {
    publications: `${publications._count._all}:${publications._max.updatedAt?.toISOString() ?? "-"}`,
    transcodes: `${transcodes._count._all}:${transcodes._max.updatedAt?.toISOString() ?? "-"}`,
    revisions: revisions.map((revision) => `${revision.id}:${revision.active ? 1 : 0}`).join(",") || "-",
    accounts: `${accounts._count._all}:${accounts._max.updatedAt?.toISOString() ?? "-"}`,
    integrity: `${integrity._count._all}:${integrity._max.startedAt?.toISOString() ?? "-"}:${integrity._max.completedAt?.toISOString() ?? "-"}`,
    catalog: `${catalog._count._all}:${catalog._max.updatedAt?.toISOString() ?? "-"}:${collections._count._all}:${collections._max.updatedAt?.toISOString() ?? "-"}`,
    cleanup: `${cleanup._count._all}:${cleanup._max.updatedAt?.toISOString() ?? "-"}`,
  };
}
function sessionIdentity(request: FastifyRequest) {
  const identity = requestSessions.get(request);
  if (!identity) throw new Error("Identidade da sessão indisponível");
  return identity;
}
function requireOwner(request: FastifyRequest, reply: FastifyReply): boolean {
  if (sessionIdentity(request).role === "owner") return true;
  void reply.code(403).send({ error: "Owner access required" });
  return false;
}
async function requireOwnedProfile(request: FastifyRequest, profileId: string, reply: FastifyReply): Promise<void> {
  const profile = await prisma.profile.findFirst({ where: { id: profileId, accountId: sessionIdentity(request).accountId }, select: { id: true } });
  if (!profile) await reply.code(404).send({ error: "Perfil não encontrado" });
}
async function requireActiveProfile(request: FastifyRequest, reply: FastifyReply) {
  const selected = auth.profile(request);
  if (!selected) {
    await reply.code(401).send({ error: "Selecione e desbloqueie um perfil" });
    return null;
  }
  const profile = await prisma.profile.findFirst({ where: { id: selected.profileId, accountId: selected.accountId }, select: { id: true, accountId: true, maxAgeRating: true } });
  if (!profile) {
    await reply.code(401).send({ error: "Perfil indisponível" });
    return null;
  }
  return profile;
}
async function requireActiveOwnedProfile(request: FastifyRequest, profileId: string, reply: FastifyReply) {
  const profile = await requireActiveProfile(request, reply);
  if (!profile) return null;
  if (profile.id !== profileId || profile.accountId !== sessionIdentity(request).accountId) {
    await reply.code(404).send({ error: "Perfil não encontrado" });
    return null;
  }
  return profile;
}
type ProfileDtoInput = { id: string; name: string; avatar: string | null; role: string; preferences: unknown; maxAgeRating: number | null; pinHash: string | null; createdAt: Date; updatedAt: Date };
function toProfileDto(profile: ProfileDtoInput) {
  return {
    id: profile.id,
    name: profile.name,
    avatar: profile.avatar,
    role: profile.role,
    preferences: profile.preferences,
    maxAgeRating: profile.maxAgeRating,
    pinProtected: Boolean(profile.pinHash),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
async function parseProfileControls(body: { pin?: unknown; maxAgeRating?: unknown }, reply: FastifyReply, partial = false): Promise<{ pinHash?: string | null; maxAgeRating?: number | null } | null> {
  const controls: { pinHash?: string | null; maxAgeRating?: number | null } = {};
  if (body.pin !== undefined) {
    if (body.pin === null || body.pin === "") controls.pinHash = null;
    else if (typeof body.pin !== "string" || !/^\d{4,8}$/.test(body.pin)) {
      await reply.code(400).send({ error: "O PIN deve conter de 4 a 8 dígitos" });
      return null;
    } else controls.pinHash = await hashPassword(body.pin);
  } else if (!partial) controls.pinHash = null;
  if (body.maxAgeRating !== undefined) {
    if (body.maxAgeRating === null || body.maxAgeRating === "") controls.maxAgeRating = null;
    else {
      const value = Number(body.maxAgeRating);
      if (!Number.isInteger(value) || value < 0 || value > 18) {
        await reply.code(400).send({ error: "Classificação etária inválida" });
        return null;
      }
      controls.maxAgeRating = value;
    }
  } else if (!partial) controls.maxAgeRating = null;
  return controls;
}
function profileAllowsWork(maxAgeRating: number | null, work: { metadata: unknown; seasons?: Array<{ metadata: unknown }> }): boolean {
  if (maxAgeRating === null) return true;
  const ratings = [ageRatingFromMetadata(work.metadata), ...(work.seasons ?? []).map((season) => ageRatingFromMetadata(season.metadata))].filter((value): value is number => value !== null);
  return ratings.length === 0 || Math.max(...ratings) <= maxAgeRating;
}
function ageRatingFromMetadata(value: unknown): number | null {
  const metadata = readObject(value);
  const candidates = [metadata.certification, metadata.content_rating, metadata.age_rating, metadata.parental_rating, readObject(metadata.tmdb).certification];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0 && candidate <= 18) return candidate;
    if (typeof candidate !== "string") continue;
    const normalized = candidate.trim().toUpperCase();
    if (["L", "LIVRE", "G", "TV-G", "TV-Y", "TV-Y7"].includes(normalized)) return 0;
    if (normalized === "PG") return 10;
    if (["PG-13", "TV-14"].includes(normalized)) return 14;
    if (normalized === "R") return 17;
    if (["NC-17", "TV-MA"].includes(normalized)) return 18;
    const numeric = normalized.match(/(?:^|\D)(10|12|13|14|16|17|18)(?:\D|$)/)?.[1];
    if (numeric) return Number(numeric);
  }
  return null;
}
async function profileAllowsItem(maxAgeRating: number | null, itemId: string): Promise<boolean> {
  if (maxAgeRating === null) return true;
  const work = await prisma.work.findUnique({ where: { id: itemId }, select: { metadata: true, seasons: { select: { metadata: true } } } });
  if (work) return profileAllowsWork(maxAgeRating, work);
  const episode = await prisma.episode.findUnique({ where: { id: itemId }, select: { work: { select: { metadata: true } }, season: { select: { metadata: true } } } });
  return episode ? profileAllowsWork(maxAgeRating, { metadata: episode.work.metadata, seasons: [episode.season] }) : false;
}
type PresentationAssetDtoInput = { id: string; type: string; publicPath: string | null; metadata: unknown };
type WorkCardDtoInput = {
  id: string;
  title: string;
  originalTitle: string | null;
  contentKind: "movie" | "series" | "anime";
  year: number | null;
  synopsis: string | null;
  metadata: unknown;
  assets: PresentationAssetDtoInput[];
  seasons: Array<{ id: string; number: number; title: string | null; metadata: unknown }>;
  editorialOverride?: { title: string | null; synopsis: string | null; hidden: boolean | null; featured: boolean | null; metadata: unknown } | null;
};
function toPresentationAssetDto(asset: PresentationAssetDtoInput) {
  return { id: asset.id, type: asset.type, publicPath: asset.publicPath, metadata: asset.metadata };
}
function editorialAuditValue(value: { title: string | null; synopsis: string | null; hidden: boolean | null; featured: boolean | null; metadata: unknown; updatedByAccountId: string; updatedAt: Date } | null) {
  return value ? {
    title: value.title,
    synopsis: value.synopsis,
    hidden: value.hidden,
    featured: value.featured,
    metadata: value.metadata,
    updatedByAccountId: value.updatedByAccountId,
    updatedAt: value.updatedAt.toISOString(),
  } : {};
}
function normalizeCollectionSlug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
function parseCollectionInput(body: { title?: unknown; slug?: unknown; description?: unknown; active?: unknown; featured?: unknown; sortOrder?: unknown; workIds?: unknown }):
  | { error: string }
  | { data: { title?: string; slug?: string; description?: string | null; active?: boolean; featured?: boolean; sortOrder?: number }; workIds?: string[] } {
  const data: { title?: string; slug?: string; description?: string | null; active?: boolean; featured?: boolean; sortOrder?: number } = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 120) return { error: "Título obrigatório, com até 120 caracteres" };
    data.title = body.title.trim();
  }
  if (body.slug !== undefined) {
    if (typeof body.slug !== "string") return { error: "Slug inválido" };
    const slug = normalizeCollectionSlug(body.slug);
    if (!slug) return { error: "Slug inválido" };
    data.slug = slug;
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") return { error: "Descrição inválida" };
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (description.length > 500) return { error: "Descrição excede 500 caracteres" };
    data.description = description || null;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return { error: "Estado ativo inválido" };
    data.active = body.active;
  }
  if (body.featured !== undefined) {
    if (typeof body.featured !== "boolean") return { error: "Destaque inválido" };
    data.featured = body.featured;
  }
  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) return { error: "Ordem inválida" };
    data.sortOrder = sortOrder;
  }
  let workIds: string[] | undefined;
  if (body.workIds !== undefined) {
    if (!Array.isArray(body.workIds) || body.workIds.length > 100 || body.workIds.some((id) => typeof id !== "string" || !id)) return { error: "Lista de obras inválida" };
    workIds = [...new Set(body.workIds as string[])];
    if (workIds.length !== body.workIds.length) return { error: "A coleção não pode repetir obras" };
  }
  return { data, workIds };
}
function collectionAuditValue(value: { slug: string; title: string; description: string | null; state: string; active: boolean; featured: boolean; sortOrder: number; publishedAt: Date | null }, workIds: string[]) {
  return { slug: value.slug, title: value.title, description: value.description, state: value.state, active: value.active, featured: value.featured, sortOrder: value.sortOrder, publishedAt: value.publishedAt?.toISOString() ?? null, workIds };
}
function toWorkCardDto(work: WorkCardDtoInput) {
  const overrideMetadata = readObject(work.editorialOverride?.metadata);
  return {
    id: work.id,
    title: work.editorialOverride?.title ?? work.title,
    originalTitle: work.originalTitle,
    contentKind: work.contentKind,
    year: work.year,
    synopsis: work.editorialOverride?.synopsis ?? work.synopsis,
    metadata: { ...readObject(work.metadata), ...overrideMetadata },
    featured: work.editorialOverride?.featured ?? false,
    assets: preferredPresentationAssets(work.assets, overrideMetadata).map(toPresentationAssetDto),
    seasons: work.seasons.map((season) => ({ id: season.id, number: season.number, title: season.title, metadata: season.metadata })),
  };
}
type WorkDetailsDtoInput = Omit<WorkCardDtoInput, "seasons"> & { seasons: Array<{
  id: string; number: number; title: string | null; metadata: unknown; completeness: unknown;
  assets: PresentationAssetDtoInput[];
  episodes: Array<{
    id: string; number: number; absoluteNumber: number | null; title: string | null; synopsis: string | null;
    metadata: unknown; markers: unknown; assets: PresentationAssetDtoInput[];
  }>;
}> };
function toWorkDetailsDto(work: WorkDetailsDtoInput) {
  const overrideMetadata = readObject(work.editorialOverride?.metadata);
  return {
    id: work.id,
    title: work.editorialOverride?.title ?? work.title,
    originalTitle: work.originalTitle,
    contentKind: work.contentKind,
    year: work.year,
    synopsis: work.editorialOverride?.synopsis ?? work.synopsis,
    metadata: { ...readObject(work.metadata), ...overrideMetadata },
    featured: work.editorialOverride?.featured ?? false,
    assets: preferredPresentationAssets(work.assets, overrideMetadata).map(toPresentationAssetDto),
    seasons: work.seasons.map((season) => ({
      id: season.id,
      number: season.number,
      title: season.title,
      metadata: season.metadata,
      completeness: season.completeness,
      assets: season.assets.map(toPresentationAssetDto),
      episodes: season.episodes.map((episode) => ({
        id: episode.id,
        number: episode.number,
        absoluteNumber: episode.absoluteNumber,
        title: episode.title,
        synopsis: episode.synopsis,
        metadata: episode.metadata,
        markers: episode.markers,
        assets: episode.assets.map(toPresentationAssetDto),
      })),
    })),
  };
}
function catalogAvailability(work: ReturnType<typeof toWorkCardDto>): string {
  return work.seasons.map((season) => readObject(season.metadata).media_availability).filter((value): value is string => typeof value === "string").join(" ").toUpperCase();
}
function recommendationTokens(value: unknown): string[] {
  const metadata = readObject(value);
  const nested = [readObject(metadata.anilist), readObject(metadata.tmdb)];
  const values = [metadata.genres, metadata.keywords, metadata.tags, metadata.studios, ...nested.flatMap((entry) => [entry.genres, entry.keywords, entry.tags, entry.studios])];
  return values.flatMap((entry) => Array.isArray(entry) ? entry : []).map((entry) => typeof entry === "string" ? entry : typeof entry === "object" && entry ? String((entry as Record<string, unknown>).name ?? "") : "").map((entry) => entry.trim().toLocaleLowerCase("pt-BR")).filter(Boolean);
}
function recommendationScore(work: ReturnType<typeof toWorkCardDto>, taste: string[], seedKinds: Array<"movie" | "series" | "anime">): number {
  const preferences = new Map<string, number>();
  for (const token of taste) preferences.set(token, (preferences.get(token) ?? 0) + 1);
  const metadataScore = recommendationTokens(work.metadata).reduce((score, token) => score + (preferences.get(token) ?? 0), 0);
  const kindScore = seedKinds.filter((kind) => kind === work.contentKind).length > seedKinds.length / 2 ? 1 : 0;
  return metadataScore * 3 + kindScore + (work.featured ? 1 : 0);
}
function preferredPresentationAssets<T extends { id: string }>(assets: T[], metadata: Record<string, unknown>): T[] {
  const preferred = new Set(Object.values(readObject(metadata.preferred_assets)).filter((value): value is string => typeof value === "string"));
  return [...assets].sort((left, right) => Number(preferred.has(right.id)) - Number(preferred.has(left.id)));
}
function manifestAssetMap(value: unknown): Map<string, string> {
  const manifest = readObject(value);
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const output = new Map<string, string>();
  for (const entry of assets) {
    const asset = readObject(entry);
    if (typeof asset.path === "string") output.set(asset.path, typeof asset.sha256 === "string" ? asset.sha256 : `${asset.size_bytes ?? ""}`);
  }
  return output;
}
function catalogGenreRows(works: Array<ReturnType<typeof toWorkCardDto>>) {
  const genres = new Map<string, { label: string; items: Array<ReturnType<typeof toWorkCardDto>> }>();
  for (const work of works) {
    const metadata = readObject(work.metadata);
    const direct = Array.isArray(metadata.genres) ? metadata.genres : [];
    const anilist = readObject(metadata.anilist);
    const nested = Array.isArray(anilist.genres) ? anilist.genres : [];
    for (const value of [...direct, ...nested]) {
      if (typeof value !== "string" || !value.trim()) continue;
      const key = value.trim().toLocaleLowerCase("pt-BR");
      const group = genres.get(key) ?? { label: value.trim(), items: [] };
      if (!group.items.some((item) => item.id === work.id)) group.items.push(work);
      genres.set(key, group);
    }
  }
  return Array.from(genres.entries()).sort((left, right) => right[1].items.length - left[1].items.length || left[1].label.localeCompare(right[1].label, "pt-BR"))
    .slice(0, 8).map(([key, group]) => ({ id: `genre:${key}`, title: group.label, items: group.items }));
}
function toJson<T>(value: T): T { return JSON.parse(JSON.stringify(value, (_key, nested) => typeof nested === "bigint" ? Number(nested) : nested)) as T; }
function jsonValue(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }
function chunks<T>(items: T[], size: number): T[][] { const output: T[][] = []; for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size)); return output; }
async function findPlaybackMedia(itemId: string): Promise<{ publicPath: string } | null> { const work = await prisma.work.findUnique({ where: { id: itemId }, include: { mediaObjects: { where: { kind: "movie_hls", publication: { state: "confirmed", revisions: { some: { active: true } } } }, orderBy: { createdAt: "desc" } } } }); if (work?.mediaObjects[0]?.publicPath) return { publicPath: work.mediaObjects[0].publicPath }; const episode = await prisma.episode.findUnique({ where: { id: itemId }, select: { id: true, activeRevisionId: true } }); const media = episode ? await activeEpisodeMedia(episode.id, episode.activeRevisionId) : null; return media?.publicPath ? { publicPath: media.publicPath } : null; }
async function activeEpisodeMedia(episodeId: string, activeRevisionId: string | null) {
  if (!activeRevisionId) return null;
  const revision = await prisma.revision.findUnique({ where: { id: activeRevisionId }, select: { publicationId: true } });
  if (!revision) return null;
  return prisma.mediaObject.findFirst({
    where: { episodeId, publicationId: revision.publicationId, kind: "episode_hls", publication: { state: "confirmed" } },
    orderBy: { createdAt: "desc" }
  });
}
async function findNextPlayableEpisode(workId: string, seasonId: string, seasonNumber: number, episodeNumber: number) {
  const candidates = await prisma.episode.findMany({
    where: { workId, hidden: false, activeRevisionId: { not: null }, season: { hidden: false }, OR: [
      { seasonId, number: { gt: episodeNumber } },
      { season: { number: { gt: seasonNumber } } }
    ] },
    include: { season: { select: { number: true } } },
    orderBy: [{ season: { number: "asc" } }, { number: "asc" }]
  });
  if (!candidates.length) return null;
  const revisionIds = candidates.map((candidate) => candidate.activeRevisionId).filter((id): id is string => Boolean(id));
  const revisions = await prisma.revision.findMany({ where: { id: { in: revisionIds } }, select: { id: true, publicationId: true } });
  const publicationByRevision = new Map(revisions.map((revision) => [revision.id, revision.publicationId]));
  const media = await prisma.mediaObject.findMany({
    where: { episodeId: { in: candidates.map((candidate) => candidate.id) }, kind: "episode_hls", publication: { state: "confirmed" } },
    select: { episodeId: true, publicationId: true }
  });
  const available = new Set(media.map((item) => `${item.episodeId}:${item.publicationId}`));
  return candidates.find((candidate) => {
    const publicationId = candidate.activeRevisionId ? publicationByRevision.get(candidate.activeRevisionId) : undefined;
    return Boolean(publicationId && available.has(`${candidate.id}:${publicationId}`));
  }) ?? null;
}
async function findPlayableSeasonEpisodes(seasonId: string) {
  const candidates = await prisma.episode.findMany({
    where: { seasonId, hidden: false, activeRevisionId: { not: null } },
    orderBy: { number: "asc" },
    select: { id: true, number: true, title: true, activeRevisionId: true },
  });
  if (!candidates.length) return [];
  const revisionIds = candidates.map((episode) => episode.activeRevisionId).filter((id): id is string => Boolean(id));
  const revisions = await prisma.revision.findMany({ where: { id: { in: revisionIds } }, select: { id: true, publicationId: true } });
  const publicationByRevision = new Map(revisions.map((revision) => [revision.id, revision.publicationId]));
  const media = await prisma.mediaObject.findMany({
    where: { episodeId: { in: candidates.map((episode) => episode.id) }, kind: "episode_hls", publication: { state: "confirmed" } },
    select: { episodeId: true, publicationId: true },
  });
  const playable = new Set(media.map((item) => `${item.episodeId}:${item.publicationId}`));
  return candidates.filter((episode) => {
    const publicationId = episode.activeRevisionId ? publicationByRevision.get(episode.activeRevisionId) : undefined;
    return Boolean(publicationId && playable.has(`${episode.id}:${publicationId}`));
  }).map(({ id, number, title }) => ({ id, number, title }));
}
async function playbackTracks(publicationId: string | null, episodeId?: string) {
  if (!publicationId) return { subtitles: [], audioTracks: [] };
  const assets = await prisma.asset.findMany({ where: {
    publicationId, ...(episodeId ? { episodeId } : {}), type: { in: ["subtitle_vtt", "audio_hls"] }
  }, orderBy: { relativePath: "asc" } });
  return {
    subtitles: assets.filter((asset) => asset.type === "subtitle_vtt").map((asset) => ({ url: asset.publicPath, metadata: asset.metadata })),
    audioTracks: assets.filter((asset) => asset.type === "audio_hls").map((asset) => ({ url: asset.publicPath, metadata: asset.metadata }))
  };
}
class UploadConflict extends Error {}

async function ensureBootstrapAccount() {
  const existing = await prisma.account.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  const account = await prisma.account.create({
    data: { username: "owner", passwordHash: await hashPassword(env.adminPassword), role: "owner" }
  });
  app.log.info({ accountId: account.id, username: account.username }, "bootstrap owner account created");
  return account;
}

const bootstrapAccount = await ensureBootstrapAccount();
await cleanupUploadTemporaries();
await ensureDefaultProfile(bootstrapAccount.id, bootstrapAccount.role);
await app.listen({ host: "0.0.0.0", port: env.port });
