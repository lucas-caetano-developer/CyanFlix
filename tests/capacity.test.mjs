import assert from "node:assert/strict";
import test from "node:test";

import { readEnv } from "../packages/shared/dist/index.js";

const required = {
  DATABASE_URL: "postgresql://example",
  PUBLISHER_TOKEN: "publisher-token",
  ADMIN_PASSWORD: "admin-password",
  SESSION_SECRET: "session-secret"
};

test("uses a dedicated publication manifest limit larger than normal JSON", () => {
  const env = readEnv({ ...required, API_BODY_LIMIT_BYTES: "2097152" });
  assert.equal(env.manifestBodyLimitBytes, 64 * 1024 * 1024);
  assert.ok(env.manifestBodyLimitBytes > 2 * 1024 * 1024);
});

test("allows the Coolify manifest limit to be configured", () => {
  const env = readEnv({ ...required, MANIFEST_BODY_LIMIT_BYTES: "134217728" });
  assert.equal(env.manifestBodyLimitBytes, 128 * 1024 * 1024);
});

test("configures bounded persistent publication workers", () => {
  const env = readEnv({
    ...required,
    PUBLICATION_WORKERS: "2",
    PUBLICATION_MAX_ATTEMPTS: "5",
    PUBLICATION_LEASE_SECONDS: "180",
    INTEGRITY_INTERVAL_HOURS: "12",
    INTEGRITY_HASH_SAMPLE_SIZE: "40",
    REVISION_RETENTION_DAYS: "45",
    REVISION_KEEP_PER_SCOPE: "3"
  });
  assert.equal(env.publicationWorkers, 2);
  assert.equal(env.publicationMaxAttempts, 5);
  assert.equal(env.publicationLeaseSeconds, 180);
  assert.equal(env.integrityIntervalHours, 12);
  assert.equal(env.integrityHashSampleSize, 40);
  assert.equal(env.revisionRetentionDays, 45);
  assert.equal(env.revisionKeepPerScope, 3);
});

test("rejects fractional publication worker counts", () => {
  assert.throws(() => readEnv({ ...required, PUBLICATION_WORKERS: "1.5" }), /positive integer/);
});
