import { prisma } from "@cyanflix/database";
import { readEnv } from "@cyanflix/shared";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const env = readEnv();
let active = 0;

console.log("CyanFlix worker iniciado", { dataRoot: env.dataRoot, ffmpegConcurrency: env.ffmpegConcurrency, ffmpegPreset: env.ffmpegPreset, ffmpegCrf: env.ffmpegCrf });

await prisma.transcodeJob.updateMany({
  where: { state: "processing", updatedAt: { lt: new Date(Date.now() - 30 * 60_000) } },
  data: { state: "queued", error: "Job retomado após interrupção do worker" }
});

setInterval(() => { void fillSlots().catch((error) => console.error("Erro no loop de transcode", error)); }, 2_000);
setInterval(() => { void pruneCache().catch((error) => console.error("Erro na limpeza do cache", error)); }, 60 * 60_000);
void fillSlots();
void pruneCache();

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
    const videoPlaylist = path.join(job.outputPath, "video.m3u8");
    const segmentPattern = path.join(job.outputPath, "segment-%05d.m4s");
    await runFfmpeg([
      "-hide_banner", "-y", "-i", job.sourcePath, "-map", "0:v:0", "-an",
      "-c:v", "libx264", "-preset", env.ffmpegPreset, "-crf", String(env.ffmpegCrf),
      "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod", "-hls_segment_type", "fmp4",
      "-hls_fmp4_init_filename", "init.mp4", "-hls_segment_filename", segmentPattern, videoPlaylist
    ]);
    await preserveProgramDateTime(job.sourcePath, videoPlaylist);
    await writeFallbackMaster(job.sourcePath, path.join(job.outputPath, "master.m3u8"));
    const sizeBytes = await directorySize(job.outputPath);
    await prisma.transcodeJob.update({ where: { id: job.id }, data: { state: "finished", sizeBytes, lastAccessAt: new Date() } });
    console.log(`Transcode finalizado: ${job.cacheKey}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.transcodeJob.update({ where: { id: job.id }, data: { state: "failed", error: message } });
    console.error(`Transcode falhou: ${job.cacheKey}`, message);
  }
}

async function writeFallbackMaster(sourceMasterPath: string, targetPath: string): Promise<void> {
  const content = await fs.promises.readFile(sourceMasterPath, "utf8");
  const sourcePublic = "/media/" + path.relative(path.join(env.dataRoot, "library"), path.dirname(sourceMasterPath)).replaceAll("\\", "/");
  const mediaLines = content.split(/\r?\n/).filter((line) => line.startsWith("#EXT-X-MEDIA:")).map((line) =>
    line.replace(/URI="([^"]+)"/, (_match, uri: string) => `URI="${resolvePublicUri(sourcePublic, uri)}"`));
  const streamLine = content.split(/\r?\n/).find((line) => line.startsWith("#EXT-X-STREAM-INF:")) ?? "#EXT-X-STREAM-INF:BANDWIDTH=8000000";
  const audio = streamLine.match(/AUDIO="([^"]+)"/)?.[0];
  const subtitles = streamLine.match(/SUBTITLES="([^"]+)"/)?.[0];
  const attributes = ["BANDWIDTH=8000000", 'CODECS="avc1.640028"', audio, subtitles].filter(Boolean).join(",");
  await fs.promises.writeFile(targetPath, ["#EXTM3U", "#EXT-X-VERSION:7", ...mediaLines, `#EXT-X-STREAM-INF:${attributes}`, "video.m3u8", ""].join("\n"), "utf8");
}

function resolvePublicUri(base: string, uri: string): string {
  if (/^https?:\/\//.test(uri) || uri.startsWith("/")) return uri;
  return `${base}/${uri}`.replace(/\/\.\//g, "/");
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

async function pruneCache(): Promise<void> {
  const cutoff = new Date(Date.now() - env.transcodeCacheTtlHours * 3600_000);
  const expired = await prisma.transcodeJob.findMany({ where: { state: { in: ["finished", "failed"] }, OR: [{ lastAccessAt: { lt: cutoff } }, { lastAccessAt: null, updatedAt: { lt: cutoff } }] }, orderBy: { updatedAt: "asc" } });
  for (const job of expired) await removeJob(job.id, job.outputPath);
  const finished = await prisma.transcodeJob.findMany({ where: { state: "finished" }, orderBy: { lastAccessAt: "asc" } });
  let total = finished.reduce((sum, job) => sum + Number(job.sizeBytes ?? 0), 0);
  const maximum = env.transcodeCacheMaxGb * 1024 ** 3;
  for (const job of finished) {
    if (total <= maximum) break;
    total -= Number(job.sizeBytes ?? 0);
    await removeJob(job.id, job.outputPath);
  }
}

async function removeJob(id: string, outputPath: string): Promise<void> {
  const cacheRoot = path.resolve(env.dataRoot, "transcode-cache");
  const target = path.resolve(outputPath);
  if (target !== cacheRoot && !target.startsWith(cacheRoot + path.sep)) throw new Error("Caminho de cache inseguro");
  await fs.promises.rm(target, { recursive: true, force: true });
  await prisma.transcodeJob.delete({ where: { id } }).catch(() => undefined);
}

function runFfmpeg(args: string[]) { return new Promise<void>((resolve, reject) => { const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] }); let stderr = ""; child.stderr.on("data", (chunk) => { stderr += chunk.toString(); if (stderr.length > 20_000) stderr = stderr.slice(-20_000); }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg saiu com código ${code}: ${stderr}`))); }); }
async function directorySize(directory: string): Promise<number> { let total = 0; for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) { const absolute = path.join(directory, entry.name); if (entry.isDirectory()) total += await directorySize(absolute); else if (entry.isFile()) total += (await fs.promises.stat(absolute)).size; } return total; }
