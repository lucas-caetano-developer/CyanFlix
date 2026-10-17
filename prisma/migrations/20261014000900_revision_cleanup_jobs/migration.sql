CREATE TABLE "RevisionCleanupJob" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "requestedByAccountId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" BIGINT,
    "error" TEXT,
    "workerId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RevisionCleanupJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RevisionCleanupJob_publicationId_key" ON "RevisionCleanupJob"("publicationId");
CREATE INDEX "RevisionCleanupJob_state_leaseUntil_createdAt_idx" ON "RevisionCleanupJob"("state", "leaseUntil", "createdAt");
