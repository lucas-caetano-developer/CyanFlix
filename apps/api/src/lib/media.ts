import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { safeDataPath } from "./storage.js";
import { readNestedObject, readObject } from "./mappers.js";

export function convertVideoToMp4(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 5000) stderr = stderr.slice(-5000);
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg remux falhou (${code}): ${stderr}`));
    });
  });
}

export function extractMediaAudioOffset(codecs: unknown, metadata?: unknown): number {
  const delivery = readNestedObject(codecs, "delivery") ?? readObject(codecs);
  let raw = delivery?.av_offset_seconds;
  if (!raw && metadata) {
    const metaDelivery =
      readNestedObject(metadata, "delivery") ?? readObject(metadata);
    raw = metaDelivery?.av_offset_seconds;
  }
  const val = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isFinite(val) ? val : 0;
}

export async function resolveAudioSource(sourceDiskPath: string): Promise<string> {
  if (!sourceDiskPath.endsWith(".m3u8")) {
    return sourceDiskPath;
  }
  try {
    const content = await fs.promises.readFile(sourceDiskPath, "utf8");
    const lines = content.split(/\r?\n/);
    const audioLines = lines.filter(
      (l) =>
        l.startsWith("#EXT-X-MEDIA:") &&
        l.includes("TYPE=AUDIO") &&
        l.includes('URI="'),
    );
    if (audioLines.length > 0) {
      // Prioritize Portuguese dub track if available, else default/first
      const preferred =
        audioLines.find((l) =>
          /LANGUAGE="por"|LANGUAGE="pt.*"|NAME=".*portug[uê]s.*"|NAME=".*dub.*"/i.test(
            l,
          ),
        ) ||
        audioLines.find((l) => /DEFAULT=YES/i.test(l)) ||
        audioLines[0];

      const match = preferred.match(/URI="([^"]+)"/);
      if (match?.[1]) {
        const uri = match[1];
        let resolved = uri;
        if (uri.startsWith("/media/")) {
          resolved = safeDataPath("library", uri.replace(/^\/media\//, ""));
        } else {
          resolved = path.resolve(path.dirname(sourceDiskPath), uri);
        }
        if (fs.existsSync(resolved)) {
          return resolved;
        }
      }
    }
  } catch {
    // fallback to original path
  }
  return sourceDiskPath;
}

export function extractAudioSegment(
  inputPath: string,
  outputPath: string,
  startSeconds: number,
  durationSeconds: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-hide_banner",
      "-y",
      "-protocol_whitelist",
      "file,http,https,tcp,tls,crypto,data",
      "-allowed_extensions",
      "ALL",
      "-i",
      inputPath,
      "-ss",
      String(Math.max(0, startSeconds)),
      "-t",
      String(Math.max(0.5, durationSeconds)),
      "-vn",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      outputPath,
    ]);
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 5000) stderr = stderr.slice(-5000);
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (
        code === 0 &&
        fs.existsSync(outputPath) &&
        fs.statSync(outputPath).size > 1000
      ) {
        resolve();
      } else {
        reject(
          new Error(
            `FFmpeg falhou ao extrair áudio (${code}): ${stderr || "arquivo de saída vazio ou sem áudio"}`,
          ),
        );
      }
    });
  });
}

export function concatAudioSegments(
  inputPaths: string[],
  outputPath: string,
): Promise<void> {
  if (inputPaths.length === 1) {
    return fs.promises.copyFile(inputPaths[0], outputPath);
  }
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-y",
      "-protocol_whitelist",
      "file,http,https,tcp,tls,crypto,data",
    ];
    for (const p of inputPaths) {
      args.push("-i", p);
    }
    const filterInputs = inputPaths
      .map(
        (_, i) =>
          `[${i}:a]aformat=channel_layouts=stereo:sample_rates=48000[a${i}];`,
      )
      .join("");
    const concatInput = inputPaths.map((_, i) => `[a${i}]`).join("");
    const filterComplex = `${filterInputs}${concatInput}concat=n=${inputPaths.length}:v=0:a=1[out]`;
    args.push(
      "-filter_complex",
      filterComplex,
      "-map",
      "[out]",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outputPath,
    );

    const child = spawn("ffmpeg", args);
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 5000) stderr = stderr.slice(-5000);
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (
        code === 0 &&
        fs.existsSync(outputPath) &&
        fs.statSync(outputPath).size > 1000
      ) {
        resolve();
      } else {
        reject(
          new Error(
            `FFmpeg concat falhou (${code}): ${stderr || "arquivo final vazio"}`,
          ),
        );
      }
    });
  });
}
