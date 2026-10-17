ALTER TABLE "Profile" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "Profile" ADD COLUMN "maxAgeRating" INTEGER;

ALTER TABLE "Profile" ADD CONSTRAINT "Profile_maxAgeRating_check"
CHECK ("maxAgeRating" IS NULL OR ("maxAgeRating" >= 0 AND "maxAgeRating" <= 18));
