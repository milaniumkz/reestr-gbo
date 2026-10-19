-- AlterTable
ALTER TABLE "User" ADD COLUMN     "residenceCity" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "TechAccount" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "passwordHash" TEXT NOT NULL,
    "totpEncrypted" TEXT,
    "totpConfirmedAt" TIMESTAMP(3),
    "lastTotpStep" INTEGER NOT NULL DEFAULT -1,
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "reauthenticatedUntil" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "requestId" TEXT,
    "actorId" TEXT,
    "actorRole" TEXT,
    "techActorId" TEXT,
    "sessionId" TEXT,
    "objectType" TEXT,
    "objectId" TEXT,
    "explanation" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "device" TEXT,
    "appVersion" TEXT,
    "problemId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "holdUntil" TIMESTAMP(3),

    CONSTRAINT "TechnicalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalProblem" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "source" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "assignedTo" TEXT,
    "resolvedVersion" TEXT,
    "verificationMethod" TEXT,
    "verificationResult" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "lastRequestId" TEXT,
    "details" JSONB,

    CONSTRAINT "TechnicalProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalComment" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'comment',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicalComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalAlert" (
    "id" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "problemId" TEXT,
    "repetitions" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "assignedTo" TEXT,
    "mutedUntil" TIMESTAMP(3),
    "muteReason" TEXT,

    CONSTRAINT "TechnicalAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalRule" (
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" INTEGER NOT NULL DEFAULT 5,
    "windowMinutes" INTEGER NOT NULL DEFAULT 15,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 30,
    "quietStart" INTEGER,
    "quietEnd" INTEGER,
    "recipients" TEXT[] DEFAULT ARRAY['owner', 'engineer']::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicalRule_pkey" PRIMARY KEY ("category")
);

-- CreateTable
CREATE TABLE "TechnicalSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicalSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "TechnicalSnapshot" (
    "key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicalSnapshot_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PasswordRecovery" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordRecovery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicalRateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicalRateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "TechAccount_login_key" ON "TechAccount"("login");

-- CreateIndex
CREATE UNIQUE INDEX "TechSession_tokenHash_key" ON "TechSession"("tokenHash");

-- CreateIndex
CREATE INDEX "TechSession_accountId_revokedAt_idx" ON "TechSession"("accountId", "revokedAt");

-- CreateIndex
CREATE INDEX "TechnicalEvent_createdAt_id_idx" ON "TechnicalEvent"("createdAt", "id");

-- CreateIndex
CREATE INDEX "TechnicalEvent_category_createdAt_idx" ON "TechnicalEvent"("category", "createdAt");

-- CreateIndex
CREATE INDEX "TechnicalEvent_requestId_idx" ON "TechnicalEvent"("requestId");

-- CreateIndex
CREATE INDEX "TechnicalEvent_problemId_createdAt_idx" ON "TechnicalEvent"("problemId", "createdAt");

-- CreateIndex
CREATE INDEX "TechnicalEvent_actorId_createdAt_idx" ON "TechnicalEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "TechnicalEvent_expiresAt_idx" ON "TechnicalEvent"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalProblem_fingerprint_key" ON "TechnicalProblem"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalAlert_dedupKey_key" ON "TechnicalAlert"("dedupKey");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordRecovery_tokenHash_key" ON "PasswordRecovery"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordRecovery_userId_createdAt_idx" ON "PasswordRecovery"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TechnicalRateLimit_expiresAt_idx" ON "TechnicalRateLimit"("expiresAt");

-- AddForeignKey
ALTER TABLE "TechSession" ADD CONSTRAINT "TechSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TechAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicalComment" ADD CONSTRAINT "TechnicalComment_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "TechnicalProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

