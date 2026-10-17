CREATE TABLE "EditorialCollection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "state" TEXT NOT NULL DEFAULT 'draft',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdByAccountId" TEXT NOT NULL,
    "updatedByAccountId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EditorialCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EditorialCollectionItem" (
    "collectionId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EditorialCollectionItem_pkey" PRIMARY KEY ("collectionId", "workId")
);

CREATE UNIQUE INDEX "EditorialCollection_slug_key" ON "EditorialCollection"("slug");
CREATE INDEX "EditorialCollection_state_active_sortOrder_idx" ON "EditorialCollection"("state", "active", "sortOrder");
CREATE INDEX "EditorialCollectionItem_collectionId_position_idx" ON "EditorialCollectionItem"("collectionId", "position");
CREATE INDEX "EditorialCollectionItem_workId_idx" ON "EditorialCollectionItem"("workId");

ALTER TABLE "EditorialCollectionItem" ADD CONSTRAINT "EditorialCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "EditorialCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditorialCollectionItem" ADD CONSTRAINT "EditorialCollectionItem_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
