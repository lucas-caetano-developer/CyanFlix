import crypto from "node:crypto";
import { z } from "zod";

export const pathSchema = z.string().min(1).refine((value) => isSafeRelativePath(value), {
  message: "Path must be relative, POSIX-style and cannot contain '..'"
});

export const assetSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  path: pathSchema,
  size_bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  season_id: z.string().optional().nullable(),
  episode_id: z.string().optional().nullable(),
  metadata: z.record(z.unknown()).optional().default({})
}).strict();

const markerSchema = z.object({
  type: z.string().min(1),
  start_ms: z.number().int().nonnegative(),
  end_ms: z.number().int().positive(),
  source: z.string().optional()
}).passthrough().refine((value) => value.end_ms > value.start_ms, {
  message: "Marker end_ms must be greater than start_ms"
});

const mediaItemSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive().optional(),
  absolute_number: z.number().int().positive().nullable().optional(),
  title: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
  markers: z.array(markerSchema).default([]),
  source_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  media_manifest: pathSchema,
  subtitle_assets: z.array(z.string().min(1)).default([]),
  subtitle_warnings: z.array(z.unknown()).default([]),
  delivery: z.record(z.unknown()).default({})
}).passthrough();

export const episodeSchema = mediaItemSchema.extend({
  number: z.number().int().positive()
});

export const seasonSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().nonnegative(),
  title: z.string().nullable().optional(),
  provider_season_number: z.number().int().nullable().optional(),
  provider_episode_start: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
  publication_completeness: z.object({
    expected_episode_count: z.number().int().nonnegative().nullable(),
    included_episode_count: z.number().int().nonnegative(),
    included_episode_numbers: z.array(z.number().int().positive()),
    missing_episode_count: z.number().int().nonnegative().nullable(),
    missing_episode_numbers: z.array(z.number().int().positive()),
    is_complete: z.boolean().nullable(),
    incomplete_publication_allowed: z.literal(true)
  }).strict()
}).passthrough();

export const manifestSchema = z.object({
  schema_version: z.literal(1),
  package_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  package_type: z.enum(["movie", "season", "episode_replacement"]),
  generated_at: z.string().datetime({ offset: true }),
  work: z.object({
    id: z.string().min(1),
    content_kind: z.enum(["movie", "series", "anime"]),
    title: z.string().min(1),
    original_title: z.string().optional().nullable(),
    year: z.number().int().optional().nullable(),
    provider_ids: z.record(z.unknown()).optional().default({}),
    metadata: z.record(z.unknown()).optional().default({})
  }).strict(),
  season: seasonSchema.optional().nullable(),
  movie: mediaItemSchema.optional().nullable(),
  episodes: z.array(episodeSchema).default([]),
  assets: z.array(assetSchema).default([]),
  delivery: z.record(z.unknown()).optional().default({}),
  manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/)
}).strict().superRefine((manifest, context) => {
  if (manifest.package_type === "season") {
    if (!manifest.season) context.addIssue({ code: z.ZodIssueCode.custom, path: ["season"], message: "Season package requires season" });
    if (manifest.movie) context.addIssue({ code: z.ZodIssueCode.custom, path: ["movie"], message: "Season package cannot contain movie" });
    if (!manifest.episodes.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["episodes"], message: "Season package requires episodes" });
  } else if (manifest.package_type === "episode_replacement") {
    if (!manifest.season) context.addIssue({ code: z.ZodIssueCode.custom, path: ["season"], message: "Episode replacement requires season" });
    if (manifest.movie) context.addIssue({ code: z.ZodIssueCode.custom, path: ["movie"], message: "Episode replacement cannot contain movie" });
    if (manifest.episodes.length !== 1) context.addIssue({ code: z.ZodIssueCode.custom, path: ["episodes"], message: "Episode replacement requires exactly one episode" });
  } else {
    if (!manifest.movie) context.addIssue({ code: z.ZodIssueCode.custom, path: ["movie"], message: "Movie package requires movie" });
    if (manifest.season || manifest.episodes.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["season"], message: "Movie package cannot contain season episodes" });
  }

  const assetIds = new Set<string>();
  const assetPaths = new Set<string>();
  for (const [index, asset] of manifest.assets.entries()) {
    if (assetIds.has(asset.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["assets", index, "id"], message: "Duplicate asset id" });
    if (assetPaths.has(asset.path)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["assets", index, "path"], message: "Duplicate asset path" });
    assetIds.add(asset.id);
    assetPaths.add(asset.path);
  }

  const episodeIds = new Set<string>();
  const episodeNumbers = new Set<number>();
  for (const [index, episode] of manifest.episodes.entries()) {
    if (episodeIds.has(episode.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["episodes", index, "id"], message: "Duplicate episode id" });
    if (episodeNumbers.has(episode.number)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["episodes", index, "number"], message: "Duplicate episode number" });
    episodeIds.add(episode.id);
    episodeNumbers.add(episode.number);
    if (!assetPaths.has(episode.media_manifest)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["episodes", index, "media_manifest"], message: "Media manifest is not an asset" });
    for (const subtitleId of episode.subtitle_assets) {
      if (!assetIds.has(subtitleId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["episodes", index, "subtitle_assets"], message: `Unknown subtitle asset ${subtitleId}` });
    }
  }
  if (manifest.movie && !assetPaths.has(manifest.movie.media_manifest)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["movie", "media_manifest"], message: "Media manifest is not an asset" });
  }
  for (const [index, asset] of manifest.assets.entries()) {
    if (asset.episode_id && !episodeIds.has(asset.episode_id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["assets", index, "episode_id"], message: "Unknown episode id" });
    if (asset.season_id && asset.season_id !== manifest.season?.id) context.addIssue({ code: z.ZodIssueCode.custom, path: ["assets", index, "season_id"], message: "Unknown season id" });
  }
});

export type PackageManifest = z.infer<typeof manifestSchema>;

export function isSafeRelativePath(value: string): boolean {
  if (!value || value.startsWith("/") || value.startsWith("\\")) return false;
  if (value.includes("\\")) return false;
  return !value.split("/").some((part) => part === "" || part === "." || part === "..");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortForJson(value));
}

export function manifestHash(manifest: Record<string, unknown>): string {
  const copy = structuredClone(manifest) as Record<string, unknown>;
  delete copy.manifest_sha256;
  return sha256(Buffer.from(canonicalJson(copy), "utf8"));
}

export function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => compareCodePoints(a, b))
        .map(([key, nested]) => [key, sortForJson(nested)])
    );
  }
  return value;
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (value) => value.codePointAt(0)!);
  const b = Array.from(right, (value) => value.codePointAt(0)!);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}
