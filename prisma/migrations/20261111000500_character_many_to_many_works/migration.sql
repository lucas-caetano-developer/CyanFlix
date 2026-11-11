-- CreateTable: many-to-many _CharacterToWork
CREATE TABLE IF NOT EXISTS "_CharacterToWork" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_CharacterToWork_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "_CharacterToWork_B_index" ON "_CharacterToWork"("B");

-- Populate existing relationships from Character.workId
INSERT INTO "_CharacterToWork" ("A", "B")
SELECT "id", "workId" FROM "Character"
WHERE "workId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Drop foreign key and column from Character
ALTER TABLE "Character" DROP CONSTRAINT IF EXISTS "Character_workId_fkey";
DROP INDEX IF EXISTS "Character_workId_idx";
ALTER TABLE "Character" DROP COLUMN IF EXISTS "workId";

-- Add foreign key constraints for _CharacterToWork
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_CharacterToWork_A_fkey') THEN
    ALTER TABLE "_CharacterToWork" ADD CONSTRAINT "_CharacterToWork_A_fkey" FOREIGN KEY ("A") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_CharacterToWork_B_fkey') THEN
    ALTER TABLE "_CharacterToWork" ADD CONSTRAINT "_CharacterToWork_B_fkey" FOREIGN KEY ("B") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
