CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "Work" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';

UPDATE "Work"
SET "searchText" = concat_ws(' ', "title", "originalTitle", "synopsis", "metadata"::text);

CREATE INDEX "Work_searchText_trgm_idx" ON "Work" USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX "Work_title_trgm_idx" ON "Work" USING GIN ("title" gin_trgm_ops);
