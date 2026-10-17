import assert from "node:assert/strict";
import test from "node:test";

import { selectRevisionCleanupCandidates } from "../packages/database/dist/index.js";

const old = new Date("2026-01-01T00:00:00Z");
const cutoff = new Date("2026-02-01T00:00:00Z");
const revision = (number, active = false) => ({
  id: `revision-${number}`,
  publicationId: `publication-${number}`,
  scopeKey: "season:test",
  number,
  active,
  createdAt: old,
  publication: { packageId: `package-${number}`, totalSizeBytes: BigInt(number * 100) },
});

test("keeps recent rollback revisions and active references out of cleanup", () => {
  const rows = [revision(4, true), revision(3), revision(2), revision(1)];
  const candidates = selectRevisionCleanupCandidates(rows, new Set(["revision-1"]), new Set(), cutoff, 2);
  assert.deepEqual(candidates.map((item) => item.revisionNumber), [2]);
});

test("does not offer publications already queued or newer than retention", () => {
  const queued = revision(1);
  const recent = { ...revision(2), createdAt: new Date("2026-03-01T00:00:00Z") };
  const candidates = selectRevisionCleanupCandidates([recent, queued], new Set(), new Set([queued.publicationId]), cutoff, 0);
  assert.deepEqual(candidates, []);
});
