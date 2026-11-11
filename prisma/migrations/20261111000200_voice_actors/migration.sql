-- CreateTable
CREATE TABLE "VoiceActor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoiceActor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceActor_name_idx" ON "VoiceActor"("name");
