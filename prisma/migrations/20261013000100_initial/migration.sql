-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('movie', 'series', 'anime');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('movie', 'season');

-- CreateEnum
CREATE TYPE "PublicationState" AS ENUM ('waiting_files', 'uploading', 'ready', 'validating', 'promoting', 'confirmed', 'failed');

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "contentKind" "ContentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "originalTitle" TEXT,
    "year" INTEGER,
    "synopsis" TEXT,
    "providerIds" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "completeness" JSONB NOT NULL DEFAULT '{}',
    "activeRevisionId" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "absoluteNumber" INTEGER,
    "title" TEXT,
    "synopsis" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "markers" JSONB NOT NULL DEFAULT '[]',
    "sourceSha256" TEXT,
    "mediaManifest" TEXT,
    "activeRevisionId" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "publicPath" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "workId" TEXT,
    "seasonId" TEXT,
    "episodeId" TEXT,
    "publicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaObject" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "publicPath" TEXT,
    "sha256" TEXT,
    "sizeBytes" BIGINT,
    "codecs" JSONB NOT NULL DEFAULT '{}',
    "workId" TEXT,
    "episodeId" TEXT,
    "publicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "packageType" "PackageType" NOT NULL,
    "manifestSha256" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "state" "PublicationState" NOT NULL DEFAULT 'waiting_files',
    "errorMessage" TEXT,
    "totalSizeBytes" BIGINT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationFile" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "expectedSha256" TEXT,
    "expectedBytes" BIGINT,
    "receivedSha256" TEXT,
    "receivedBytes" BIGINT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicationFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationReceipt" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "remoteWorkId" TEXT,
    "remoteSeasonId" TEXT,
    "remoteEpisodeIds" JSONB NOT NULL DEFAULT '{}',
    "remoteRevision" INTEGER NOT NULL,
    "manifestSha256" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewingProgress" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "workId" TEXT,
    "episodeId" TEXT,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscodeJob" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "outputPath" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "sizeBytes" BIGINT,
    "lastAccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranscodeJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Work_stableId_key" ON "Work"("stableId");

-- CreateIndex
CREATE UNIQUE INDEX "Season_stableId_key" ON "Season"("stableId");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_stableId_key" ON "Episode"("stableId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_publicationId_relativePath_key" ON "Asset"("publicationId", "relativePath");

-- CreateIndex
CREATE INDEX "MediaObject_workId_kind_idx" ON "MediaObject"("workId", "kind");

-- CreateIndex
CREATE INDEX "MediaObject_episodeId_kind_idx" ON "MediaObject"("episodeId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MediaObject_publicationId_relativePath_key" ON "MediaObject"("publicationId", "relativePath");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_uploadId_key" ON "Publication"("uploadId");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_packageId_key" ON "Publication"("packageId");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_idempotencyKey_key" ON "Publication"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationFile_publicationId_relativePath_key" ON "PublicationFile"("publicationId", "relativePath");

-- CreateIndex
CREATE UNIQUE INDEX "PublicationReceipt_publicationId_key" ON "PublicationReceipt"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Revision_scopeKey_number_key" ON "Revision"("scopeKey", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_profileId_workId_key" ON "Favorite"("profileId", "workId");

-- CreateIndex
CREATE INDEX "ViewingProgress_profileId_updatedAt_idx" ON "ViewingProgress"("profileId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ViewingProgress_profileId_workId_key" ON "ViewingProgress"("profileId", "workId");

-- CreateIndex
CREATE UNIQUE INDEX "ViewingProgress_profileId_episodeId_key" ON "ViewingProgress"("profileId", "episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "TranscodeJob_cacheKey_key" ON "TranscodeJob"("cacheKey");

-- CreateIndex
CREATE INDEX "TranscodeJob_state_createdAt_idx" ON "TranscodeJob"("state", "createdAt");

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaObject" ADD CONSTRAINT "MediaObject_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaObject" ADD CONSTRAINT "MediaObject_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaObject" ADD CONSTRAINT "MediaObject_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationFile" ADD CONSTRAINT "PublicationFile_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationReceipt" ADD CONSTRAINT "PublicationReceipt_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewingProgress" ADD CONSTRAINT "ViewingProgress_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewingProgress" ADD CONSTRAINT "ViewingProgress_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewingProgress" ADD CONSTRAINT "ViewingProgress_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
