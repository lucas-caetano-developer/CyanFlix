import fs from "node:fs";
import path from "node:path";
import { env, uploadDirectories } from "./config.js";

export function safeDataPath(...parts: string[]): string {
  const root = path.resolve(env.dataRoot);
  const target = path.resolve(
    root,
    ...parts.flatMap((part) => part.replaceAll("\\", "/").split("/")),
  );
  if (target !== root && !target.startsWith(root + path.sep))
    throw new Error("Caminho fora de DATA_ROOT");
  return target;
}

export function ensureUploadDirectory(directory: string): Promise<void> {
  const key = path.resolve(directory);
  const existing = uploadDirectories.get(key);
  if (existing) return existing;
  const creating = fs.promises
    .mkdir(key, { recursive: true })
    .then(() => undefined);
  uploadDirectories.set(key, creating);
  creating.catch(() => {
    if (uploadDirectories.get(key) === creating) uploadDirectories.delete(key);
  });
  return creating;
}

export async function directoryExists(value: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(value)).isDirectory();
  } catch {
    return false;
  }
}

export async function cleanupUploadTemporaries(): Promise<void> {
  const root = safeDataPath("staging");
  if (!(await directoryExists(root))) return;
  const cutoff = Date.now() - 60 * 60_000;
  async function walk(current: string): Promise<void> {
    for (const entry of await fs.promises.readdir(current, {
      withFileTypes: true,
    })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (
        entry.isFile() &&
        entry.name.includes(".tmp-") &&
        (await fs.promises.stat(absolute)).mtimeMs < cutoff
      )
        await fs.promises.rm(absolute, { force: true });
    }
  }
  await walk(root);
}
