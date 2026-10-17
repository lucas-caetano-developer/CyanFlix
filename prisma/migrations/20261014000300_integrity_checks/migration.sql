CREATE TABLE "IntegrityCheck" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'running',
    "checkedAssets" INTEGER NOT NULL DEFAULT 0,
    "hashedAssets" INTEGER NOT NULL DEFAULT 0,
    "missingAssets" INTEGER NOT NULL DEFAULT 0,
    "corruptAssets" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "IntegrityCheck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrityCheck_bucket_key" ON "IntegrityCheck"("bucket");
CREATE INDEX "IntegrityCheck_startedAt_idx" ON "IntegrityCheck"("startedAt");
