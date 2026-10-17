import { prisma, findRevisionCleanupCandidates } from "@cyanflix/database";
import { readEnv } from "@cyanflix/shared";
import { finalizePublication } from "@cyanflix/ingestion";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { buildFallbackMaster, fallbackVariants, type FallbackVariant } from "./fallback.js";

const env = readEnv();
const workerId = `${process.env.HOSTNAME ?? "worker"}:${process.pid}:${crypto.randomUUID()}`;
let active = 0;
let activeFinalizations = 0;
let cleanupActive = false;

console.log("CyanFlix worker iniciado", { workerId, dataRoot: env.dataRoot, ffmpegConcurrency: env.ffmpegConcurrency, publicationWorkers: env.publicationWorkers, ffmpegPreset: env.ffmpegPreset, ffmpegCrf: env.ffmpegCrf });

await prisma.transcodeJob.updateMany({
  where: { state: "processing", updatedAt: { lt: new Date(Date.now() - 30 * 60_000) } },
  data: { state: "queued", error: "Job retomado após interrupção do worker" }
});
await prisma.integrityCheck.updateMany({
  where: { state: "running", startedAt: { lt: new Date(Date.now() - 6 * 60 * 60_000) } },
  data: { state: "failed", completedAt: new Date(), details: [{ type: "interrupted", message: "Verificação interrompida antes da conclusão" }] },
});

setInterval(() => { void fillSlots().catch((error) => console.error("Erro no loop de transcode", error)); }, 2_000);
setInterval(() => { void fillFinalizationSlots().catch((error) => console.error("Erro no loop de publicações", error)); }, 2_000);
setInterval(() => { void pruneCache().catch((error) => console.error("Erro na limpeza do cache", error)); }, 60 * 60_000);
setInterval(() => { void runIntegrityCheckIfDue().catch((error) => console.error("Erro na verificação de integridade", error)); }, Math.min(60 * 60_000, env.integrityIntervalHours * 60 * 60_000));
setInterval(() => { void processNextRevisionCleanup().catch((error) => console.error("Erro na coleta de revisões", error)); }, 10_000);
void fillSlots();
void fillFinalizationSlots();
void pruneCache();
void runIntegrityCheckIfDue();
void processNextRevisionCleanup();

async function processNextRevisionCleanup(): Promise<void> {
  if (cleanupActive) return;
  if (await prisma.integrityCheck.findFirst({ where: { state: "running" }, select: { id: true } })) return;
  const now = new Date();
  const candidate = await prisma.revisionCleanupJob.findFirst({
    where: { attempts: { lt: 3 }, OR: [{ state: "queued" }, { state: "processing", leaseUntil: { lt: now } }] },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return;
  const claimed = await prisma.revisionCleanupJob.updateMany({
    where: { id: candidate.id, OR: [{ state: "queued" }, { state: "processing", leaseUntil: { lt: now } }] },
    data: { state: "processing", workerId, leaseUntil: new Date(now.getTime() + 10 * 60_000), startedAt: now, attempts: { increment: 1 }, error: null },
  });
  if (!claimed.count) return;
  cleanupActive = true;
  try {
    await executeRevisionCleanup(candidate.id, candidate.publicationId);
  } finally {
    cleanupActive = false;
  }
}

async function executeRevisionCleanup(jobId: string, publicationId: string): Promise<void> {
  const source = path.join(env.dataRoot, "library", "publications", publicationId);
  const trash = path.join(env.dataRoot, "trash", "revisions", jobId);
  let databaseDeleted = false;
  try {
    const publication = await prisma.publication.findUnique({ where: { id: publicationId }, select: { id: true } });
    if (!publication) {
      await fs.promises.rm(trash, { recursive: true, force: true });
      await prisma.revisionCleanupJob.update({ where: { id: jobId }, data: { state: "completed", completedAt: new Date(), workerId: null, leaseUntil: null } });
      return;
    }
    const eligible = await findRevisionCleanupCandidates(env.revisionRetentionDays, env.revisionKeepPerScope, [publicationId]);
    const cleanup = eligible.find((item) => item.publicationId === publicationId);
    if (!cleanup) throw new Error("Publicação não é mais elegível para coleta");

    await fs.promises.mkdir(path.dirname(trash), { recursive: true });
    if (await directoryExists(source) && !await directoryExists(trash)) await fs.promises.rename(source, trash);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cleanup.scopeKey}))`;
      const revisions = await tx.revision.findMany({ where: { publicationId }, select: { id: true, active: true } });
      if (!revisions.length) throw new Error("Publicação sem revisão durante a coleta");
      const revisionIds = revisions.map((revision) => revision.id);
      const [seasonReferences, episodeReferences] = await Promise.all([
        tx.season.count({ where: { activeRevisionId: { in: revisionIds } } }),
        tx.episode.count({ where: { activeRevisionId: { in: revisionIds } } }),
      ]);
      if (revisions.some((revision) => revision.active) || seasonReferences > 0 || episodeReferences > 0) throw new Error("Revisão voltou a ser referenciada durante a coleta");
      await tx.asset.deleteMany({ where: { publicationId } });
      await tx.mediaObject.deleteMany({ where: { publicationId } });
      await tx.publication.delete({ where: { id: publicationId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
    databaseDeleted = true;

    await fs.promises.rm(trash, { recursive: true, force: true });
    await prisma.revisionCleanupJob.update({ where: { id: jobId }, data: { state: "completed", completedAt: new Date(), workerId: null, leaseUntil: null } });
    console.log("Revisão sem referência coletada", { jobId, publicationId });
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 4_000);
    try {
      if (!databaseDeleted && !await directoryExists(source) && await directoryExists(trash)) {
        await fs.promises.mkdir(path.dirname(source), { recursive: true });
        await fs.promises.rename(trash, source);
      }
    } catch (restoreError) {
      console.error("Falha ao restaurar publicação após coleta interrompida", { publicationId, restoreError });
    }
    await prisma.revisionCleanupJob.update({ where: { id: jobId }, data: { state: "failed", error: message, workerId: null, leaseUntil: null } });
    console.error("Coleta de revisão falhou", { jobId, publicationId, error: message });
  }
}

async function directoryExists(directory: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(directory)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function fillFinalizationSlots(): Promise<void> {
  while (activeFinalizations < env.publicationWorkers) {
    const publication = await claimNextPublication();
    if (!publication) return;
    activeFinalizations += 1;
    void processPublication(publication).finally(() => {
      activeFinalizations -= 1;
      void fillFinalizationSlots();
    });
  }
}

async function claimNextPublication() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const now = new Date();
    const available: Prisma.PublicationWhereInput = {
      state: { in: ["validating", "promoting"] },
      receipt: null,
      AND: [
        { OR: [{ finalizationLeaseUntil: null }, { finalizationLeaseUntil: { lte: now } }] },
        { OR: [{ finalizationNextAttemptAt: null }, { finalizationNextAttemptAt: { lte: now } }] },
      ],
    };
    const candidate = await prisma.publication.findFirst({
      where: available,
      orderBy: [{ finalizationNextAttemptAt: "asc" }, { updatedAt: "asc" }],
      select: { id: true, uploadId: true, finalizationAttempts: true },
    });
    if (!candidate) return null;
    const leaseUntil = new Date(now.getTime() + env.publicationLeaseSeconds * 1000);
    const claimed = await prisma.publication.updateMany({
      where: { id: candidate.id, ...available },
      data: {
        finalizationWorkerId: workerId,
        finalizationLeaseUntil: leaseUntil,
        finalizationHeartbeatAt: now,
        finalizationNextAttemptAt: null,
        finalizationAttempts: { increment: 1 },
        errorMessage: null,
      },
    });
    if (claimed.count) return { ...candidate, finalizationAttempts: candidate.finalizationAttempts + 1 };
  }
  return null;
}

async function processPublication(publication: { id: string; uploadId: string; finalizationAttempts: number }): Promise<void> {
  console.log("Processando finalização de publicação", { uploadId: publication.uploadId, attempt: publication.finalizationAttempts, workerId });
  const heartbeat = setInterval(() => {
    void renewPublicationLease(publication.id).catch((error) => console.error("Falha no heartbeat da publicação", { publicationId: publication.id, error }));
  }, Math.max(5_000, Math.floor(env.publicationLeaseSeconds * 1000 / 3)));
  try {
    await finalizePublication(publication.id, publication.uploadId, env.dataRoot, console);
    await prisma.publication.updateMany({
      where: { id: publication.id, finalizationWorkerId: workerId },
      data: { finalizationWorkerId: null, finalizationLeaseUntil: null, finalizationHeartbeatAt: null, finalizationNextAttemptAt: null },
    });
  } catch (error) {
    const receipt = await prisma.publicationReceipt.findUnique({ where: { publicationId: publication.id }, select: { id: true } });
    if (receipt) {
      await prisma.publication.updateMany({
        where: { id: publication.id, finalizationWorkerId: workerId },
        data: { finalizationWorkerId: null, finalizationLeaseUntil: null, finalizationHeartbeatAt: null, finalizationNextAttemptAt: null },
      });
      return;
    }
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 4_000);
    const terminal = publication.finalizationAttempts >= env.publicationMaxAttempts;
    const delaySeconds = Math.min(15 * 2 ** Math.max(0, publication.finalizationAttempts - 1), 15 * 60);
    const nextAttemptAt = terminal ? null : new Date(Date.now() + delaySeconds * 1000);
    await prisma.publication.updateMany({
      where: { id: publication.id, finalizationWorkerId: workerId },
      data: {
        state: terminal ? "failed" : undefined,
        errorMessage: terminal ? message : `Tentativa ${publication.finalizationAttempts} falhou; nova tentativa agendada: ${message}`,
        finalizationWorkerId: null,
        finalizationLeaseUntil: null,
        finalizationHeartbeatAt: null,
        finalizationNextAttemptAt: nextAttemptAt,
      },
    });
    console.error("Finalização de publicação falhou", { publicationId: publication.id, attempt: publication.finalizationAttempts, terminal, nextAttemptAt, error: message });
  } finally {
    clearInterval(heartbeat);
  }
}

async function renewPublicationLease(publicationId: string): Promise<void> {
  const now = new Date();
  const renewed = await prisma.publication.updateMany({
    where: { id: publicationId, finalizationWorkerId: workerId, state: { in: ["validating", "promoting"] } },
    data: { finalizationHeartbeatAt: now, finalizationLeaseUntil: new Date(now.getTime() + env.publicationLeaseSeconds * 1000) },
  });
  if (!renewed.count) throw new Error("Lease da publicação não pertence mais a este worker");
}

async function fillSlots(): Promise<void> {
  while (active < env.ffmpegConcurrency) {
    const job = await claimNextJob();
    if (!job) return;
    active += 1;
    void processJob(job).finally(() => { active -= 1; void fillSlots(); });
  }
}

async function claimNextJob() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await prisma.transcodeJob.findFirst({ where: { state: "queued" }, orderBy: { createdAt: "asc" } });
    if (!candidate) return null;
    const claimed = await prisma.transcodeJob.updateMany({ where: { id: candidate.id, state: "queued" }, data: { state: "processing", error: null } });
    if (claimed.count) return candidate;
  }
  return null;
}

async function processJob(job: { id: string; cacheKey: string; sourcePath: string; outputPath: string }): Promise<void> {
  try {
    await fs.promises.rm(job.outputPath, { recursive: true, force: true });
    await fs.promises.mkdir(job.outputPath, { recursive: true });
    const source = await probeVideo(job.sourcePath);
    const variants = fallbackVariants(source.width, source.height);
    const filters: string[] = [];
    if (variants.length === 1) filters.push(`[0:v:0]scale=-2:${variants[0].height}[video0]`);
    else {
      const splitInputs = variants.map((_variant, index) => `[split${index}]`).join("");
      filters.push(`[0:v:0]split=${variants.length}${splitInputs}`);
      for (let index = 0; index < variants.length; index += 1) filters.push(`[split${index}]scale=-2:${variants[index].height}[video${index}]`);
    }
    // The source master can have an intentional A/V offset (for example audio
    // at 0 and video at 724 ms). Keep the video timeline instead of letting
    // FFmpeg rebase the H.264 rendition to zero while reusing the source audio.
    const args = ["-hide_banner", "-y", "-copyts", "-i", job.sourcePath, "-filter_complex", filters.join(";")];
    for (let index = 0; index < variants.length; index += 1) {
      const variant = variants[index];
      const directory = path.join(job.outputPath, variant.name);
      await fs.promises.mkdir(directory, { recursive: true });
      args.push(
        "-map", `[video${index}]`, "-an", "-c:v", "libx264", "-preset", env.ffmpegPreset,
        "-profile:v", "high", "-level:v", variant.level, "-pix_fmt", "yuv420p", "-crf", String(env.ffmpegCrf),
        "-b:v", `${variant.bitrateKbps}k`, "-maxrate", `${variant.maxRateKbps}k`, "-bufsize", `${variant.bufferKbps}k`,
        "-force_key_frames", "expr:gte(t,n_forced*6)", "-sc_threshold", "0",
        "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_segment_type", "fmp4",
        "-hls_fmp4_init_filename", path.join(directory, "init.mp4"), "-hls_segment_filename", path.join(directory, "segment-%05d.m4s"), path.join(directory, "video.m3u8"),
      );
    }
    await runFfmpeg(args);
    await Promise.all(variants.map(async (variant) => {
      const playlist = path.join(job.outputPath, variant.name, "video.m3u8");
      await normalizeInitUri(playlist);
      await preserveProgramDateTime(job.sourcePath, playlist);
      await assertTimelinePreserved(source.startTime, playlist);
    }));
    await writeFallbackMaster(job.sourcePath, path.join(job.outputPath, "master.m3u8"), variants);
    const sizeBytes = await directorySize(job.outputPath);
    await prisma.transcodeJob.update({ where: { id: job.id }, data: { state: "finished", sizeBytes, lastAccessAt: new Date() } });
    console.log(`Transcode finalizado: ${job.cacheKey}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.transcodeJob.update({ where: { id: job.id }, data: { state: "failed", error: message } });
    console.error(`Transcode falhou: ${job.cacheKey}`, message);
  }
}

async function probeVideo(sourcePath: string): Promise<{ width: number; height: number; startTime: number | null }> {
  const output = await runProcessCapture("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,start_time", "-of", "json", sourcePath]);
  const parsed = JSON.parse(output) as { streams?: Array<{ width?: number; height?: number; start_time?: string }> };
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream.height) throw new Error("Não foi possível detectar a resolução do vídeo original");
  const startTime = Number(stream.start_time);
  return { width: stream.width, height: stream.height, startTime: Number.isFinite(startTime) ? startTime : null };
}

async function assertTimelinePreserved(sourceStartTime: number | null, outputPlaylist: string): Promise<void> {
  if (sourceStartTime === null) return;
  const output = await probeVideo(outputPlaylist);
  if (output.startTime === null || Math.abs(output.startTime - sourceStartTime) > 0.1) {
    throw new Error(`Fallback H.264 alterou o início do vídeo (${sourceStartTime.toFixed(3)}s -> ${output.startTime?.toFixed(3) ?? "indisponível"}s)`);
  }
}

async function writeFallbackMaster(sourceMasterPath: string, targetPath: string, variants: FallbackVariant[]): Promise<void> {
  const content = await fs.promises.readFile(sourceMasterPath, "utf8");
  const sourcePublic = "/media/" + path.relative(path.join(env.dataRoot, "library"), path.dirname(sourceMasterPath)).replaceAll("\\", "/");
  await fs.promises.writeFile(targetPath, buildFallbackMaster(content, sourcePublic, variants), "utf8");
}

async function preserveProgramDateTime(sourceMasterPath: string, outputPlaylist: string): Promise<void> {
  const master = await fs.promises.readFile(sourceMasterPath, "utf8");
  const lines = master.split(/\r?\n/);
  const streamIndex = lines.findIndex((line) => line.startsWith("#EXT-X-STREAM-INF:"));
  const sourceVideo = streamIndex >= 0 ? lines.slice(streamIndex + 1).find((line) => line && !line.startsWith("#")) : null;
  if (!sourceVideo) return;
  const sourcePlaylist = await fs.promises.readFile(path.resolve(path.dirname(sourceMasterPath), sourceVideo), "utf8");
  const pdt = sourcePlaylist.split(/\r?\n/).find((line) => line.startsWith("#EXT-X-PROGRAM-DATE-TIME:"));
  if (!pdt) return;
  const output = await fs.promises.readFile(outputPlaylist, "utf8");
  await fs.promises.writeFile(outputPlaylist, output.replace("#EXTINF:", `${pdt}\n#EXTINF:`), "utf8");
}

async function normalizeInitUri(playlistPath: string): Promise<void> {
  const content = await fs.promises.readFile(playlistPath, "utf8");
  const normalized = content.replace(/^#EXT-X-MAP:URI="[^"]+"/m, '#EXT-X-MAP:URI="init.mp4"');
  await fs.promises.writeFile(playlistPath, normalized, "utf8");
}

async function pruneCache(): Promise<void> {
  const now = new Date();
  const cutoff = new Date(Date.now() - env.transcodeCacheTtlHours * 3600_000);
  const expired = await prisma.transcodeJob.findMany({ where: { state: { in: ["finished", "failed"] }, AND: [
    { OR: [{ protectedUntil: null }, { protectedUntil: { lte: now } }] },
    { OR: [{ lastAccessAt: { lt: cutoff } }, { lastAccessAt: null, updatedAt: { lt: cutoff } }] }
  ] }, orderBy: { updatedAt: "asc" } });
  for (const job of expired) await removeJob(job.id, job.outputPath, now);
  const finished = await prisma.transcodeJob.findMany({ where: { state: "finished" }, orderBy: { lastAccessAt: "asc" } });
  let total = finished.reduce((sum, job) => sum + Number(job.sizeBytes ?? 0), 0);
  const maximum = env.transcodeCacheMaxGb * 1024 ** 3;
  for (const job of finished) {
    if (total <= maximum) break;
    if (job.protectedUntil && job.protectedUntil > now) continue;
    if (await removeJob(job.id, job.outputPath, now)) total -= Number(job.sizeBytes ?? 0);
  }
}

async function removeJob(id: string, outputPath: string, now: Date): Promise<boolean> {
  const cacheRoot = path.resolve(env.dataRoot, "transcode-cache");
  const target = path.resolve(outputPath);
  if (target !== cacheRoot && !target.startsWith(cacheRoot + path.sep)) throw new Error("Caminho de cache inseguro");
  const claimed = await prisma.transcodeJob.updateMany({
    where: { id, state: { in: ["finished", "failed"] }, OR: [{ protectedUntil: null }, { protectedUntil: { lte: now } }] },
    data: { state: "deleting" },
  });
  if (!claimed.count) return false;
  await fs.promises.rm(target, { recursive: true, force: true });
  await prisma.transcodeJob.delete({ where: { id } }).catch(() => undefined);
  return true;
}

async function runIntegrityCheckIfDue(): Promise<void> {
  const intervalMs = env.integrityIntervalHours * 60 * 60_000;
  const bucket = String(Math.floor(Date.now() / intervalMs));
  const running = await prisma.integrityCheck.findFirst({ where: { state: "running" }, orderBy: { startedAt: "desc" }, select: { id: true, startedAt: true } });
  if (running) {
    if (running.startedAt > new Date(Date.now() - 6 * 60 * 60_000)) return;
    await prisma.integrityCheck.updateMany({
      where: { id: running.id, state: "running" },
      data: { state: "failed", completedAt: new Date(), details: [{ type: "timeout", message: "Verificação excedeu a janela máxima de seis horas" }] },
    });
  }
  let check: { id: string };
  try {
    check = await prisma.integrityCheck.create({ data: { bucket } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return;
    throw error;
  }

  console.log("Verificação de integridade iniciada", { checkId: check.id, bucket });
  try {
    const cleaning = await prisma.revisionCleanupJob.findMany({ where: { state: "processing" }, select: { publicationId: true } });
    const assets = await prisma.asset.findMany({
      where: { publication: { state: "confirmed", id: { notIn: cleaning.map((job) => job.publicationId) } }, publicPath: { not: null } },
      orderBy: { id: "asc" },
      select: { id: true, publicPath: true, sizeBytes: true, sha256: true },
    });
    const sampleIndexes = integritySampleIndexes(assets.length, env.integrityHashSampleSize, bucket);
    const issues: Array<{ assetId: string; path: string; type: string; message: string }> = [];
    let missingAssets = 0;
    let corruptAssets = 0;
    let hashedAssets = 0;

    for (let start = 0; start < assets.length; start += 32) {
      const batch = assets.slice(start, start + 32);
      await Promise.all(batch.map(async (asset, offset) => {
        const index = start + offset;
        const publicPath = asset.publicPath!;
        try {
          const absolutePath = integrityAssetPath(publicPath);
          const stat = await fs.promises.stat(absolutePath);
          if (!stat.isFile() || BigInt(stat.size) !== asset.sizeBytes) {
            corruptAssets += 1;
            if (issues.length < 100) issues.push({ assetId: asset.id, path: publicPath, type: "size", message: `Esperado ${asset.sizeBytes.toString()} bytes; encontrado ${stat.size}` });
            return;
          }
          if (sampleIndexes.has(index)) {
            hashedAssets += 1;
            const digest = await hashFile(absolutePath);
            if (digest !== asset.sha256) {
              corruptAssets += 1;
              if (issues.length < 100) issues.push({ assetId: asset.id, path: publicPath, type: "sha256", message: "SHA-256 diverge do manifesto" });
            }
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") missingAssets += 1;
          else corruptAssets += 1;
          if (issues.length < 100) issues.push({ assetId: asset.id, path: publicPath, type: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "read", message: error instanceof Error ? error.message : String(error) });
        }
      }));
    }

    const state = missingAssets || corruptAssets ? "failed" : "passed";
    await prisma.integrityCheck.update({
      where: { id: check.id },
      data: { state, checkedAssets: assets.length, hashedAssets, missingAssets, corruptAssets, details: issues, completedAt: new Date() },
    });
    console.log("Verificação de integridade concluída", { checkId: check.id, state, checkedAssets: assets.length, hashedAssets, missingAssets, corruptAssets });
  } catch (error) {
    await prisma.integrityCheck.update({
      where: { id: check.id },
      data: { state: "failed", details: [{ type: "internal", message: error instanceof Error ? error.message : String(error) }], completedAt: new Date() },
    }).catch(() => undefined);
    throw error;
  }
}

function integritySampleIndexes(total: number, requested: number, bucket: string): Set<number> {
  if (!total) return new Set();
  const count = Math.min(total, requested);
  const step = total / count;
  const seed = Number.parseInt(crypto.createHash("sha256").update(bucket).digest("hex").slice(0, 8), 16);
  const offset = (seed % 10_000) / 10_000 * step;
  return new Set(Array.from({ length: count }, (_value, index) => Math.min(total - 1, Math.floor(offset + index * step))));
}

function integrityAssetPath(publicPath: string): string {
  if (!publicPath.startsWith("/media/")) throw new Error("Asset fora da biblioteca pública");
  const root = path.resolve(env.dataRoot, "library");
  const target = path.resolve(root, ...publicPath.slice("/media/".length).replaceAll("\\", "/").split("/"));
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("Caminho de asset fora da biblioteca");
  return target;
}

async function hashFile(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function runFfmpeg(args: string[]) { return new Promise<void>((resolve, reject) => { const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] }); let stderr = ""; child.stderr.on("data", (chunk) => { stderr += chunk.toString(); if (stderr.length > 20_000) stderr = stderr.slice(-20_000); }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg saiu com código ${code}: ${stderr}`))); }); }
function runProcessCapture(command: string, args: string[]) { return new Promise<string>((resolve, reject) => { const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = ""; child.stdout.on("data", (chunk) => { stdout += chunk.toString(); }); child.stderr.on("data", (chunk) => { stderr += chunk.toString(); if (stderr.length > 20_000) stderr = stderr.slice(-20_000); }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} saiu com código ${code}: ${stderr}`))); }); }
async function directorySize(directory: string): Promise<number> { let total = 0; for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) { const absolute = path.join(directory, entry.name); if (entry.isDirectory()) total += await directorySize(absolute); else if (entry.isFile()) total += (await fs.promises.stat(absolute)).size; } return total; }
