import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, ensureDefaultProfile } from "@cyanflix/database";
import { readEnv } from "@cyanflix/shared";
import { canonicalJson, isSafeRelativePath, manifestHash, manifestSchema, type PackageManifest } from "@cyanflix/contracts";
import { createAuth } from "./auth.js";

const env = readEnv();
const auth = createAuth(env);
const app = Fastify({ logger: true, trustProxy: process.env.TRUST_PROXY === "true", bodyLimit: Number(process.env.API_BODY_LIMIT_BYTES ?? 2 * 1024 * 1024) });
const allowedOrigin = new URL(env.appUrl).origin;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

await app.register(cors, { origin: allowedOrigin, credentials: true });
app.addContentTypeParser("application/octet-stream", (_request, payload, done) => done(null, payload));

app.addHook("onRequest", async (request, reply) => {
  const pathname = request.url.split("?", 1)[0];
  if (pathname === "/health" || pathname === "/api/health" || pathname === "/api/auth/login" || pathname === "/v1/auth/token") return;
  if (pathname.startsWith("/v1/")) {
    if (!auth.canPublish(request)) return reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  if (pathname.startsWith("/api/") && !auth.hasSession(request)) return reply.code(401).send({ error: "Authentication required" });
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
  const body = request.body as { password?: string };
  const now = Date.now();
  const attempt = loginAttempts.get(request.ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 5) return reply.code(429).send({ error: "Muitas tentativas; aguarde alguns minutos" });
  if (!auth.matchesSecret(body?.password, env.adminPassword)) {
    loginAttempts.set(request.ip, { count: attempt && attempt.resetAt > now ? attempt.count + 1 : 1, resetAt: now + 5 * 60_000 });
    return reply.code(401).send({ error: "Credenciais inválidas" });
  }
  loginAttempts.delete(request.ip);
  auth.setSession(reply);
  return { authenticated: true, role: "admin" };
});
app.post("/api/auth/logout", async (_request, reply) => { auth.clearSession(reply); return reply.code(204).send(); });
app.get("/api/auth/session", async () => ({ authenticated: true, role: "admin" }));
app.get("/api/auth/verify", async (_request, reply) => reply.code(204).send());

app.post("/v1/auth/token", async (request, reply) => {
  const header = request.headers.authorization;
  const candidate = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!auth.matchesSecret(candidate, env.publisherToken)) return reply.code(401).send({ error: "Unauthorized" });
  return auth.publisherAccessToken();
});

app.get("/api/profiles", async () => { await ensureDefaultProfile(); return prisma.profile.findMany({ orderBy: { createdAt: "asc" } }); });
app.post("/api/profiles", async (request, reply) => {
  const body = request.body as { name?: string; avatar?: string; role?: string };
  if (!body?.name?.trim()) return reply.code(400).send({ error: "Nome obrigatório" });
  return prisma.profile.create({ data: { name: body.name.trim(), avatar: body.avatar ?? "cyan", role: body.role === "admin" ? "admin" : "viewer" } });
});
app.patch("/api/profiles/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as { name?: string; avatar?: string };
  if (!body?.name?.trim()) return reply.code(400).send({ error: "Nome obrigatório" });
  return prisma.profile.update({ where: { id }, data: { name: body.name.trim(), avatar: body.avatar } });
});
app.delete("/api/profiles/:id", async (request, reply) => { await prisma.profile.delete({ where: { id: (request.params as { id: string }).id } }); return reply.code(204).send(); });

const workCardInclude = { assets: { where: { seasonId: null, episodeId: null }, orderBy: { createdAt: "desc" as const } }, seasons: true } as const;
app.get("/api/home", async () => {
  const works = await prisma.work.findMany({ where: { hidden: false }, include: workCardInclude, orderBy: { createdAt: "desc" }, take: 40 });
  return toJson({ hero: works[0] ?? null, rows: [
    { id: "recent", title: "Adicionados recentemente", items: works },
    { id: "movies", title: "Filmes", items: works.filter((item) => item.contentKind === "movie") },
    { id: "series", title: "Séries", items: works.filter((item) => item.contentKind === "series") },
    { id: "anime", title: "Animes", items: works.filter((item) => item.contentKind === "anime") }
  ] });
});
app.get("/api/search", async (request) => {
  const q = String((request.query as { q?: string }).q ?? "").trim();
  if (!q) return [];
  return toJson(await prisma.work.findMany({ where: { hidden: false, OR: [{ title: { contains: q, mode: "insensitive" } }, { originalTitle: { contains: q, mode: "insensitive" } }] }, include: workCardInclude, take: 50 }));
});
app.get("/api/works/:id", async (request, reply) => {
  const work = await prisma.work.findUnique({
    where: { id: (request.params as { id: string }).id },
    include: {
      assets: { where: { seasonId: null, episodeId: null }, orderBy: { createdAt: "desc" } },
      seasons: {
        where: { hidden: false },
        orderBy: { number: "asc" },
        include: {
          assets: { where: { episodeId: null }, orderBy: { createdAt: "desc" } },
          episodes: {
            where: { hidden: false },
            orderBy: { number: "asc" },
            include: { assets: { orderBy: { createdAt: "desc" } } }
          }
        }
      }
    }
  });
  return work ? toJson(work) : reply.code(404).send({ error: "Obra não encontrada" });
});

app.post("/api/profiles/:profileId/favorites/:workId", async (request, reply) => {
  const { profileId, workId } = request.params as { profileId: string; workId: string };
  await prisma.favorite.upsert({ where: { profileId_workId: { profileId, workId } }, create: { profileId, workId }, update: {} });
  return reply.code(204).send();
});
app.delete("/api/profiles/:profileId/favorites/:workId", async (request, reply) => {
  const { profileId, workId } = request.params as { profileId: string; workId: string };
  await prisma.favorite.deleteMany({ where: { profileId, workId } });
  return reply.code(204).send();
});
app.get("/api/profiles/:profileId/favorites", async (request) => {
  const rows = await prisma.favorite.findMany({ where: { profileId: (request.params as { profileId: string }).profileId }, orderBy: { createdAt: "desc" }, include: { work: { include: workCardInclude } } });
  return toJson(rows.map((row) => row.work).filter((work) => !work.hidden));
});
app.put("/api/profiles/:profileId/progress/:itemId", async (request, reply) => {
  const { profileId, itemId } = request.params as { profileId: string; itemId: string };
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
app.get("/api/profiles/:profileId/progress/:itemId", async (request) => {
  const { profileId, itemId } = request.params as { profileId: string; itemId: string };
  const row = await prisma.viewingProgress.findFirst({ where: { profileId, OR: [{ workId: itemId }, { episodeId: itemId }] } });
  return row ? toJson(row) : { positionSeconds: 0, durationSeconds: null, completed: false };
});
app.get("/api/profiles/:profileId/continue-watching", async (request) => {
  const rows = await prisma.viewingProgress.findMany({ where: { profileId: (request.params as { profileId: string }).profileId, completed: false, positionSeconds: { gt: 0 } }, orderBy: { updatedAt: "desc" }, include: { work: { include: workCardInclude }, episode: { include: { work: { include: workCardInclude } } } }, take: 30 });
  const seen = new Set<string>();
  return toJson(rows.map((row) => row.work ?? row.episode?.work).filter((work): work is NonNullable<typeof work> => Boolean(work && !work.hidden && !seen.has(work.id) && seen.add(work.id))));
});

app.get("/api/playback/items/:itemId", async (request, reply) => {
  const { itemId } = request.params as { itemId: string };
  const work = await prisma.work.findUnique({ where: { id: itemId }, include: { mediaObjects: { where: { kind: "movie_hls", publication: { state: "confirmed" } }, orderBy: { createdAt: "desc" } } } });
  if (work) {
    const media = work.mediaObjects[0];
    if (!media?.publicPath) return reply.code(404).send({ error: "Mídia do filme não encontrada" });
    const tracks = await playbackTracks(media.publicationId);
    return { itemType: "movie", title: work.title, originalUrl: media.publicPath, markers: readNestedArray(media.codecs, "markers"), ...tracks, nextEpisode: null, fallback: { available: true, status: "not_requested" } };
  }
  const episode = await prisma.episode.findUnique({ where: { id: itemId }, include: { mediaObjects: { where: { kind: "episode_hls", publication: { state: "confirmed" } }, orderBy: { createdAt: "desc" } }, work: true, season: { include: { episodes: { where: { hidden: false }, orderBy: { number: "asc" } } } } } });
  if (!episode) return reply.code(404).send({ error: "Item não encontrado" });
  const media = episode.mediaObjects[0];
  if (!media?.publicPath) return reply.code(404).send({ error: "Mídia do episódio não encontrada" });
  const tracks = await playbackTracks(media.publicationId, episode.id);
  const next = episode.season.episodes.find((item) => item.number > episode.number) ?? null;
  return { itemType: "episode", title: `${episode.work.title} — ${episode.title ?? `Episódio ${episode.number}`}`, originalUrl: media.publicPath, markers: episode.markers, ...tracks, nextEpisode: next ? { id: next.id, number: next.number, title: next.title } : null, fallback: { available: true, status: "not_requested" } };
});

app.post("/api/playback/items/:itemId/fallback", async (request, reply) => {
  const media = await findPlaybackMedia((request.params as { itemId: string }).itemId);
  if (!media) return reply.code(404).send({ error: "Mídia não encontrada" });
  const cacheKey = crypto.createHash("sha256").update(`${media.publicPath}:h264:${env.ffmpegPreset}:${env.ffmpegCrf}`).digest("hex");
  const outputPath = path.join(env.dataRoot, "transcode-cache", cacheKey);
  const sourcePath = safeDataPath("library", media.publicPath.replace(/^\/media\//, ""));
  const existing = await prisma.transcodeJob.findUnique({ where: { cacheKey } });
  const job = existing?.state === "failed" ? await prisma.transcodeJob.update({ where: { id: existing.id }, data: { state: "queued", error: null, lastAccessAt: new Date() } }) : await prisma.transcodeJob.upsert({ where: { cacheKey }, create: { cacheKey, sourcePath, outputPath, state: "queued" }, update: { lastAccessAt: new Date() } });
  return reply.code(job.state === "finished" ? 200 : 202).send({ jobId: job.id, cacheKey, status: job.state, url: `/transcode/${cacheKey}/master.m3u8` });
});
app.get("/api/playback/jobs/:jobId", async (request, reply) => {
  const job = await prisma.transcodeJob.findUnique({ where: { id: (request.params as { jobId: string }).jobId } });
  return job ? toJson({ id: job.id, status: job.state, error: job.error, url: job.state === "finished" ? `/transcode/${job.cacheKey}/master.m3u8` : undefined }) : reply.code(404).send({ error: "Job não encontrado" });
});

app.get("/api/admin/dashboard", async () => {
  const [works, seasons, episodes, publications, transcodes] = await Promise.all([prisma.work.count(), prisma.season.count(), prisma.episode.count(), prisma.publication.count(), prisma.transcodeJob.count()]);
  return { works, seasons, episodes, publications, transcodes };
});
app.get("/api/admin/publications", async () => toJson(await prisma.publication.findMany({ orderBy: { createdAt: "desc" }, include: { files: true, receipt: true } })));

app.post("/v1/publications", async (request, reply) => {
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
  const publication = await prisma.publication.create({ data: {
    uploadId, packageId: manifest.package_id, idempotencyKey: manifest.idempotency_key, packageType: manifest.package_type,
    manifestSha256: manifest.manifest_sha256, manifest: jsonValue(manifest), totalSizeBytes: BigInt(totalSize),
    files: { create: expectedPaths.map((relativePath) => { const asset = manifest.assets.find((item) => item.path === relativePath); return { relativePath, expectedSha256: asset?.sha256, expectedBytes: asset ? BigInt(asset.size_bytes) : undefined }; }) }
  } });
  try { await fs.promises.mkdir(stagingFilesRoot(uploadId), { recursive: true }); }
  catch (error) { await prisma.publication.delete({ where: { id: publication.id } }); throw error; }
  return publicationStatus(publication.id, reply);
});

app.get("/v1/publications/:uploadId", async (request, reply) => {
  const publication = await prisma.publication.findUnique({ where: { uploadId: (request.params as { uploadId: string }).uploadId } });
  return publication ? publicationStatus(publication.id, reply) : reply.code(404).send({ error: "Publicação não encontrada" });
});

app.put("/v1/publications/:uploadId/files/*", async (request, reply) => {
  const { uploadId } = request.params as { uploadId: string };
  let relativePath: string;
  try { relativePath = decodeURIComponent((request.params as Record<string, string>)["*"] ?? ""); }
  catch { return reply.code(400).send({ error: "Caminho inválido" }); }
  if (!isSafeRelativePath(relativePath)) return reply.code(400).send({ error: "Caminho inválido" });
  const publication = await prisma.publication.findUnique({ where: { uploadId }, include: { files: true } });
  if (!publication) return reply.code(404).send({ error: "Publicação não encontrada" });
  if (["validating", "promoting", "confirmed"].includes(publication.state)) return reply.code(409).send({ error: "Publicação não aceita novos arquivos neste estado" });
  const file = publication.files.find((item) => item.relativePath === relativePath);
  if (!file) return reply.code(404).send({ error: "Arquivo não esperado" });
  const expectedHeader = request.headers["x-content-sha256"]?.toString().toLowerCase();
  if (!expectedHeader?.match(/^[a-f0-9]{64}$/)) return reply.code(400).send({ error: "X-Content-SHA256 obrigatório" });
  const declaredBytes = Number(request.headers["content-length"]);
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > env.maxUploadSizeBytes) return reply.code(413).send({ error: "Content-Length inválido ou acima do limite" });
  if (file.expectedBytes !== null && BigInt(declaredBytes) !== file.expectedBytes) return reply.code(409).send({ error: "Tamanho não confere com o manifesto" });
  if (file.expectedSha256 && expectedHeader !== file.expectedSha256) return reply.code(409).send({ error: "Hash declarado não confere com o manifesto" });
  const destination = safeDataPath("staging", uploadId, "files", relativePath);
  const temporary = `${destination}.tmp-${crypto.randomUUID()}`;
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
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
    await prisma.$transaction([
      prisma.publicationFile.update({ where: { id: file.id }, data: { receivedSha256, receivedBytes: BigInt(bytes), receivedAt: new Date() } }),
      prisma.publication.update({ where: { id: publication.id }, data: { state: "uploading", errorMessage: null } })
    ]);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true });
    if (error instanceof UploadConflict) return reply.code(409).send({ error: error.message, relativePath, receivedBytes: bytes });
    throw error;
  }
  return publicationStatus(publication.id, reply);
});

app.post("/v1/publications/:uploadId/complete", async (request, reply) => {
  const { uploadId } = request.params as { uploadId: string };
  const publication = await prisma.publication.findUnique({ where: { uploadId }, include: { files: true, receipt: true } });
  if (!publication) return reply.code(404).send({ error: "Publicação não encontrada" });
  if (publication.receipt) return publicationStatus(publication.id, reply);
  const missing = publication.files.filter((file) => !file.receivedAt).map((file) => file.relativePath);
  if (missing.length) return reply.code(409).send({ error: "Arquivos pendentes", missing_paths: missing });
  const receivedTotal = publication.files.reduce((sum, file) => sum + (file.receivedBytes ?? 0n), 0n);
  if (publication.totalSizeBytes === null || receivedTotal !== publication.totalSizeBytes) {
    return reply.code(409).send({ error: "Tamanho total recebido diverge do tamanho declarado",
      declared_bytes: publication.totalSizeBytes?.toString(), received_bytes: receivedTotal.toString() });
  }
  const claimed = await prisma.publication.updateMany({ where: { id: publication.id, state: { in: ["waiting_files", "uploading", "ready", "failed"] } }, data: { state: "validating", errorMessage: null } });
  if (!claimed.count) return reply.code(409).send({ error: "Finalização já está em andamento", state: publication.state });
  try {
    const manifest = manifestSchema.parse(publication.manifest);
    const stagingRoot = stagingFilesRoot(uploadId);
    const libraryRelativeRoot = `publications/${publication.id}`;
    const libraryRoot = safeDataPath("library", libraryRelativeRoot);
    const sourceRoot = await directoryExists(stagingRoot) ? stagingRoot : libraryRoot;
    await validateStagedPackage(sourceRoot, publication.files.map((file) => file.relativePath), manifest, publication.manifestSha256);
    await prisma.publication.update({ where: { id: publication.id }, data: { state: "promoting" } });
    if (sourceRoot === stagingRoot) {
      await fs.promises.mkdir(path.dirname(libraryRoot), { recursive: true });
      if (await directoryExists(libraryRoot)) throw new Error("Diretório final já existe para uma publicação não confirmada");
      await fs.promises.rename(stagingRoot, libraryRoot);
    }
    await promoteManifest(publication.id, libraryRelativeRoot, manifest);
    return publicationStatus(publication.id, reply);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.publication.update({ where: { id: publication.id }, data: { state: "failed", errorMessage: message } }).catch(() => undefined);
    request.log.error({ err: error, uploadId }, "publication completion failed");
    return reply.code(422).send({ error: "Falha ao validar ou promover publicação", detail: message });
  }
});

async function promoteManifest(publicationId: string, libraryRelativeRoot: string, manifest: PackageManifest): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${manifest.package_type === "season" ? manifest.season!.id : manifest.work.id}))`;
    const work = await tx.work.upsert({ where: { stableId: manifest.work.id }, create: {
      stableId: manifest.work.id, contentKind: manifest.work.content_kind, title: manifest.work.title, originalTitle: manifest.work.original_title,
      year: manifest.work.year, synopsis: readNestedString(manifest.work.metadata, "overview"), providerIds: jsonValue(manifest.work.provider_ids), metadata: jsonValue(manifest.work.metadata)
    }, update: { contentKind: manifest.work.content_kind, title: manifest.work.title, originalTitle: manifest.work.original_title, year: manifest.work.year, synopsis: readNestedString(manifest.work.metadata, "overview"), providerIds: jsonValue(manifest.work.provider_ids), metadata: jsonValue(manifest.work.metadata) } });
    let season: { id: string; stableId: string } | null = null;
    const episodeMap: Record<string, string> = {};
    if (manifest.package_type === "season") {
      const existingSeason = await tx.season.findUnique({ where: { stableId: manifest.season!.id } });
      if (existingSeason && existingSeason.workId !== work.id) throw new Error("ID estável da temporada pertence a outra obra");
      season = await tx.season.upsert({ where: { stableId: manifest.season!.id }, create: {
        stableId: manifest.season!.id, workId: work.id, number: manifest.season!.number, title: manifest.season!.title,
        metadata: jsonValue(manifest.season!.metadata), completeness: jsonValue(manifest.season!.publication_completeness)
      }, update: { number: manifest.season!.number, title: manifest.season!.title, metadata: jsonValue(manifest.season!.metadata), completeness: jsonValue(manifest.season!.publication_completeness) } });
      for (const item of manifest.episodes) {
        const existing = await tx.episode.findUnique({ where: { stableId: item.id } });
        if (existing && (existing.workId !== work.id || existing.seasonId !== season.id)) throw new Error(`ID estável do episódio ${item.id} pertence a outro escopo`);
        const episode = await tx.episode.upsert({ where: { stableId: item.id }, create: {
          stableId: item.id, workId: work.id, seasonId: season.id, number: item.number, absoluteNumber: item.absolute_number,
          title: item.title, synopsis: readNestedString(item.metadata, "synopsis") ?? readNestedString(item.metadata, "overview"),
          metadata: jsonValue({ ...item.metadata, delivery: item.delivery }), markers: jsonValue(item.markers), sourceSha256: item.source_sha256, mediaManifest: item.media_manifest
        }, update: { number: item.number, absoluteNumber: item.absolute_number, title: item.title, synopsis: readNestedString(item.metadata, "synopsis") ?? readNestedString(item.metadata, "overview"), metadata: jsonValue({ ...item.metadata, delivery: item.delivery }), markers: jsonValue(item.markers), sourceSha256: item.source_sha256, mediaManifest: item.media_manifest } });
        episodeMap[item.id] = episode.id;
      }
    }
    const assetRows = manifest.assets.map((asset) => ({
      stableId: asset.id, type: asset.type, relativePath: asset.path,
      publicPath: `/media/${libraryRelativeRoot}/${asset.path}`,
      sizeBytes: BigInt(asset.size_bytes), sha256: asset.sha256,
      metadata: asset.metadata as Prisma.InputJsonValue, workId: work.id,
      seasonId: asset.season_id ? season?.id ?? null : null,
      episodeId: asset.episode_id ? episodeMap[asset.episode_id] : null,
      publicationId
    }));
    for (const rows of chunks(assetRows, 1000)) await tx.asset.createMany({ data: rows });
    if (manifest.package_type === "movie") {
      await tx.mediaObject.create({ data: { kind: "movie_hls", relativePath: manifest.movie!.media_manifest, publicPath: `/media/${libraryRelativeRoot}/${manifest.movie!.media_manifest}`, codecs: jsonValue({ delivery: manifest.movie!.delivery, markers: manifest.movie!.markers }), workId: work.id, publicationId } });
    } else {
      await tx.mediaObject.createMany({ data: manifest.episodes.map((item) => ({
        kind: "episode_hls", relativePath: item.media_manifest,
        publicPath: `/media/${libraryRelativeRoot}/${item.media_manifest}`,
        codecs: item.delivery as Prisma.InputJsonValue, workId: work.id,
        episodeId: episodeMap[item.id], publicationId
      })) });
    }
    const scopeKey = manifest.package_type === "season" ? `season:${manifest.season!.id}` : `movie:${manifest.work.id}`;
    const latest = await tx.revision.aggregate({ where: { scopeKey }, _max: { number: true } });
    const revisionNumber = (latest._max.number ?? 0) + 1;
    await tx.revision.updateMany({ where: { scopeKey, active: true }, data: { active: false } });
    const revision = await tx.revision.create({ data: { publicationId, scopeKey, number: revisionNumber, snapshot: jsonValue(manifest) } });
    if (season) await tx.season.update({ where: { id: season.id }, data: { activeRevisionId: revision.id } });
    if (manifest.package_type === "season") await tx.episode.updateMany({ where: { id: { in: Object.values(episodeMap) } }, data: { activeRevisionId: revision.id } });
    await tx.publicationReceipt.create({ data: { publicationId, packageId: manifest.package_id, remoteWorkId: work.id, remoteSeasonId: season?.id, remoteEpisodeIds: episodeMap, remoteRevision: revisionNumber, manifestSha256: manifest.manifest_sha256 } });
    await tx.publication.update({ where: { id: publicationId }, data: { state: "confirmed", confirmedAt: new Date(), errorMessage: null } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}

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

async function validateStagedPackage(root: string, expectedPaths: string[], storedManifest: PackageManifest, expectedManifestHash: string): Promise<void> {
  const actualPaths = await listFiles(root);
  if (actualPaths.length !== expectedPaths.length || actualPaths.some((item) => !expectedPaths.includes(item))) throw new Error("Conteúdo do pacote difere dos caminhos declarados");
  const uploadedManifest = manifestSchema.parse(JSON.parse(await fs.promises.readFile(path.join(root, "manifest.json"), "utf8")));
  if (manifestHash(uploadedManifest as unknown as Record<string, unknown>) !== expectedManifestHash || uploadedManifest.manifest_sha256 !== expectedManifestHash) throw new Error("Hash do manifest.json enviado não confere");
  if (canonicalJson(uploadedManifest) !== canonicalJson(storedManifest)) throw new Error("manifest.json enviado difere do manifesto iniciado");
  const checksums = parseChecksums(await fs.promises.readFile(path.join(root, "checksums.sha256"), "utf8"));
  const covered = expectedPaths.filter((item) => item !== "checksums.sha256").sort();
  if (checksums.size !== covered.length || covered.some((item) => !checksums.has(item))) throw new Error("checksums.sha256 não cobre exatamente o pacote");
  for (const relativePath of covered) {
    const absolute = path.join(root, ...relativePath.split("/"));
    const stat = await fs.promises.stat(absolute);
    const digest = await hashFile(absolute);
    if (checksums.get(relativePath) !== digest) throw new Error(`Checksum inválido para ${relativePath}`);
    const asset = storedManifest.assets.find((item) => item.path === relativePath);
    if (asset && (stat.size !== asset.size_bytes || digest !== asset.sha256)) throw new Error(`Asset diverge do manifesto: ${relativePath}`);
  }
}

function parseChecksums(content: string): Map<string, string> {
  const output = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^([a-fA-F0-9]{64})  (.+)$/);
    if (!match) throw new Error(`Linha inválida em checksums.sha256: ${line}`);
    const relativePath = match[2].replaceAll("\\", "/");
    if (!isSafeRelativePath(relativePath) || relativePath === "checksums.sha256") throw new Error(`Caminho inválido em checksums.sha256: ${relativePath}`);
    if (output.has(relativePath)) throw new Error(`Caminho duplicado em checksums.sha256: ${relativePath}`);
    output.set(relativePath, match[1].toLowerCase());
  }
  return output;
}

function safeDataPath(...parts: string[]): string {
  const root = path.resolve(env.dataRoot);
  const target = path.resolve(root, ...parts.flatMap((part) => part.replaceAll("\\", "/").split("/")));
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("Caminho fora de DATA_ROOT");
  return target;
}
function stagingFilesRoot(uploadId: string): string { return safeDataPath("staging", uploadId, "files"); }
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
async function listFiles(root: string): Promise<string[]> { const output: string[] = []; async function walk(current: string, prefix = "") { for (const entry of await fs.promises.readdir(current, { withFileTypes: true })) { const relative = prefix ? `${prefix}/${entry.name}` : entry.name; const absolute = path.join(current, entry.name); if (entry.isDirectory()) await walk(absolute, relative); else if (entry.isFile()) output.push(relative); else throw new Error(`Entrada não suportada: ${relative}`); } } await walk(root); return output.sort(); }
async function hashFile(filePath: string): Promise<string> { const hash = crypto.createHash("sha256"); for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk as Buffer); return hash.digest("hex"); }
function readNestedString(value: unknown, key: string): string | null { if (!value || typeof value !== "object") return null; const nested = (value as Record<string, unknown>)[key]; return typeof nested === "string" && nested.trim() ? nested : null; }
function readNestedArray(value: unknown, key: string): unknown[] { if (!value || typeof value !== "object") return []; const nested = (value as Record<string, unknown>)[key]; return Array.isArray(nested) ? nested : []; }
function toJson<T>(value: T): T { return JSON.parse(JSON.stringify(value, (_key, nested) => typeof nested === "bigint" ? Number(nested) : nested)) as T; }
function jsonValue(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }
function chunks<T>(items: T[], size: number): T[][] { const output: T[][] = []; for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size)); return output; }
async function findPlaybackMedia(itemId: string): Promise<{ publicPath: string } | null> { const work = await prisma.work.findUnique({ where: { id: itemId }, include: { mediaObjects: { where: { kind: "movie_hls", publication: { state: "confirmed" } }, orderBy: { createdAt: "desc" } } } }); if (work?.mediaObjects[0]?.publicPath) return { publicPath: work.mediaObjects[0].publicPath }; const episode = await prisma.episode.findUnique({ where: { id: itemId }, include: { mediaObjects: { where: { kind: "episode_hls", publication: { state: "confirmed" } }, orderBy: { createdAt: "desc" } } } }); return episode?.mediaObjects[0]?.publicPath ? { publicPath: episode.mediaObjects[0].publicPath } : null; }
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

await prisma.publication.updateMany({
  where: { state: { in: ["validating", "promoting"] }, receipt: null },
  data: { state: "failed", errorMessage: "Finalização interrompida; pronta para retomada" }
});
await cleanupUploadTemporaries();
await ensureDefaultProfile();
await app.listen({ host: "0.0.0.0", port: env.port });
