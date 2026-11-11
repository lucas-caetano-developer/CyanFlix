-- CreateTable
CREATE TABLE IF NOT EXISTS "Character" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,
    "role" TEXT,
    "archetype" TEXT,
    "voiceAudioUrl" TEXT,
    "voiceActorId" TEXT,
    "workId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Character_workId_idx" ON "Character"("workId");
CREATE INDEX IF NOT EXISTS "Character_voiceActorId_idx" ON "Character"("voiceActorId");
CREATE INDEX IF NOT EXISTS "Character_name_idx" ON "Character"("name");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Character_voiceActorId_fkey'
  ) THEN
    ALTER TABLE "Character" ADD CONSTRAINT "Character_voiceActorId_fkey" FOREIGN KEY ("voiceActorId") REFERENCES "VoiceActor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Character_workId_fkey'
  ) THEN
    ALTER TABLE "Character" ADD CONSTRAINT "Character_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
