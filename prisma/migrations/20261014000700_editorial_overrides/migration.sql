CREATE TABLE "EditorialOverride" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "title" TEXT,
    "synopsis" TEXT,
    "hidden" BOOLEAN,
    "featured" BOOLEAN,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "updatedByAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EditorialOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorAccountId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EditorialOverride_workId_key" ON "EditorialOverride"("workId");
CREATE INDEX "EditorialOverride_featured_hidden_idx" ON "EditorialOverride"("featured", "hidden");
CREATE INDEX "AuditLog_targetType_targetId_createdAt_idx" ON "AuditLog"("targetType", "targetId", "createdAt");
CREATE INDEX "AuditLog_actorAccountId_createdAt_idx" ON "AuditLog"("actorAccountId", "createdAt");
CREATE INDEX "EditorialOverride_title_trgm_idx" ON "EditorialOverride" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "EditorialOverride_synopsis_trgm_idx" ON "EditorialOverride" USING GIN ("synopsis" gin_trgm_ops);

ALTER TABLE "EditorialOverride" ADD CONSTRAINT "EditorialOverride_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorialOverride" ADD CONSTRAINT "EditorialOverride_updatedByAccountId_fkey" FOREIGN KEY ("updatedByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorAccountId_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
