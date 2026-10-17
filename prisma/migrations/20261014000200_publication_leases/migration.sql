ALTER TABLE "Publication"
  ADD COLUMN "finalizationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "finalizationWorkerId" TEXT,
  ADD COLUMN "finalizationLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "finalizationNextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "finalizationHeartbeatAt" TIMESTAMP(3);

CREATE INDEX "Publication_state_finalizationNextAttemptAt_finalizationLeaseUntil_idx"
  ON "Publication"("state", "finalizationNextAttemptAt", "finalizationLeaseUntil");
