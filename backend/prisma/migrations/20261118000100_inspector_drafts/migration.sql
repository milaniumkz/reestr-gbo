CREATE TABLE "InspectionDraft" (
 "id" TEXT NOT NULL,
 "userId" TEXT NOT NULL,
 "organizationId" TEXT NOT NULL,
 "fields" JSONB NOT NULL,
 "files" JSONB NOT NULL DEFAULT '{}',
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "InspectionDraft_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "InspectionDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "InspectionDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "InspectionDraft_userId_updatedAt_idx" ON "InspectionDraft"("userId", "updatedAt");
