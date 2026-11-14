ALTER TABLE "Session" ADD COLUMN "identityVerifiedAt" TIMESTAMP(3);
CREATE TABLE "InspectorIdentityProfile" (
 "userId" TEXT PRIMARY KEY, "template" TEXT NOT NULL, "referencePath" TEXT NOT NULL,
 "referenceVideoPath" TEXT NOT NULL, "model" TEXT NOT NULL, "consentVersion" TEXT NOT NULL,
 "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "InspectorIdentityProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "InspectorIdentityChallenge" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "passwordVersion" INTEGER NOT NULL,
 "secretHash" TEXT NOT NULL, "purpose" TEXT NOT NULL, "actions" JSONB NOT NULL, "consentVersion" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'READY', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL, "videoDigest" TEXT, "videoSignature" TEXT, "videoPath" TEXT, "reason" TEXT, "completedAt" TIMESTAMP(3),
 CONSTRAINT "InspectorIdentityChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InspectorIdentityChallenge_userId_videoDigest_key" ON "InspectorIdentityChallenge"("userId","videoDigest");
CREATE INDEX "InspectorIdentityChallenge_userId_createdAt_idx" ON "InspectorIdentityChallenge"("userId","createdAt");
CREATE INDEX "InspectorIdentityChallenge_expiresAt_status_idx" ON "InspectorIdentityChallenge"("expiresAt","status");
