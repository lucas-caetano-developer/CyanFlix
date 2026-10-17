ALTER TABLE "TranscodeJob" ADD COLUMN "protectedUntil" TIMESTAMP(3);
CREATE INDEX "TranscodeJob_state_protectedUntil_lastAccessAt_idx"
  ON "TranscodeJob"("state", "protectedUntil", "lastAccessAt");
