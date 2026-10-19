-- User-requested temporary password 123456, bcrypt cost 12. New and existing users must replace it.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '$2b$12$i.sS/wBAoDl.IRiJFeQjue1wpHeFFZ9dlER8f/EAmmreRVcVQAElq',
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "passwordVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "failedPasswordAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "passwordLockedUntil" TIMESTAMP(3),
ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
UPDATE "Session" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL;
DELETE FROM "OtpChallenge";
