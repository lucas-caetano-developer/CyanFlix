-- Per-profile like/dislike reactions for a work. Replaces the previous value
-- when the viewer changes their reaction; deleting the profile or work removes
-- the reaction through the existing cascade rules.
CREATE TABLE "WorkRating" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkRating_profileId_workId_key" ON "WorkRating"("profileId", "workId");
CREATE INDEX "WorkRating_workId_value_idx" ON "WorkRating"("workId", "value");

ALTER TABLE "WorkRating" ADD CONSTRAINT "WorkRating_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkRating" ADD CONSTRAINT "WorkRating_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
