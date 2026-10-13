export type AppEnv = {
  nodeEnv: string;
  appUrl: string;
  port: number;
  databaseUrl: string;
  publisherToken: string;
  adminPassword: string;
  sessionSecret: string;
  sessionTtlHours: number;
  publisherAccessTtlMinutes: number;
  dataRoot: string;
  maxUploadSizeBytes: number;
  maxPackageSizeBytes: number;
  maxPackageFiles: number;
  ffmpegConcurrency: number;
  ffmpegPreset: string;
  ffmpegCrf: number;
  transcodeCacheMaxGb: number;
  transcodeCacheTtlHours: number;
};

export function readEnv(env = process.env): AppEnv {
  const value = {
    nodeEnv: env.NODE_ENV ?? "development",
    appUrl: env.APP_URL ?? "http://localhost:8080",
    port: Number(env.PORT ?? 3000),
    databaseUrl: required(env.DATABASE_URL, "DATABASE_URL"),
    publisherToken: required(env.PUBLISHER_TOKEN, "PUBLISHER_TOKEN"),
    adminPassword: required(env.ADMIN_PASSWORD, "ADMIN_PASSWORD"),
    sessionSecret: required(env.SESSION_SECRET, "SESSION_SECRET"),
    sessionTtlHours: positiveNumber(env.SESSION_TTL_HOURS, 168, "SESSION_TTL_HOURS"),
    publisherAccessTtlMinutes: positiveNumber(env.PUBLISHER_ACCESS_TTL_MINUTES, 15, "PUBLISHER_ACCESS_TTL_MINUTES"),
    dataRoot: env.DATA_ROOT ?? "/data",
    maxUploadSizeBytes: positiveNumber(env.MAX_UPLOAD_SIZE_BYTES, 10 * 1024 ** 3, "MAX_UPLOAD_SIZE_BYTES"),
    maxPackageSizeBytes: positiveNumber(env.MAX_PACKAGE_SIZE_BYTES, 500 * 1024 ** 3, "MAX_PACKAGE_SIZE_BYTES"),
    maxPackageFiles: positiveNumber(env.MAX_PACKAGE_FILES, 100_000, "MAX_PACKAGE_FILES"),
    ffmpegConcurrency: positiveNumber(env.FFMPEG_CONCURRENCY, 1, "FFMPEG_CONCURRENCY"),
    ffmpegPreset: env.FFMPEG_PRESET ?? "veryfast",
    ffmpegCrf: Number(env.FFMPEG_CRF ?? 22),
    transcodeCacheMaxGb: Number(env.TRANSCODE_CACHE_MAX_GB ?? 100),
    transcodeCacheTtlHours: Number(env.TRANSCODE_CACHE_TTL_HOURS ?? 168)
  };
  if (value.nodeEnv === "production") {
    for (const [name, secret] of [["PUBLISHER_TOKEN", value.publisherToken], ["ADMIN_PASSWORD", value.adminPassword], ["SESSION_SECRET", value.sessionSecret]] as const) {
      if (secret.length < 24 || /alterar|change-me|cyanflix/i.test(secret)) throw new Error(`${name} must be a strong secret in production`);
    }
  }
  return value;
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveNumber(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number`);
  return parsed;
}

export function ok<T>(data: T) {
  return { ok: true as const, data };
}
