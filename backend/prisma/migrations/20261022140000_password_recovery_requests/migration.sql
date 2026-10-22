CREATE TABLE "PasswordRecoveryRequest" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "organizationId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending', "approvedBy" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PasswordRecoveryRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PasswordRecoveryRequest_organizationId_status_createdAt_idx" ON "PasswordRecoveryRequest"("organizationId", "status", "createdAt");
CREATE INDEX "PasswordRecoveryRequest_userId_status_idx" ON "PasswordRecoveryRequest"("userId", "status");
