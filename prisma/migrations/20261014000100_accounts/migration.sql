-- Accounts are introduced as an expand migration. Existing profiles remain nullable until
-- the API bootstrap links them to the initial owner account.
CREATE TYPE "AccountRole" AS ENUM ('owner', 'admin', 'viewer');

CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AccountRole" NOT NULL DEFAULT 'viewer',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");

ALTER TABLE "Profile" ADD COLUMN "accountId" TEXT;
CREATE INDEX "Profile_accountId_createdAt_idx" ON "Profile"("accountId", "createdAt");
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
