ALTER TABLE "Inspection"
ADD COLUMN "createdById" TEXT,
ADD COLUMN "submittedById" TEXT,
ADD COLUMN "approvedById" TEXT;

ALTER TABLE "Inspection"
ADD CONSTRAINT "Inspection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Inspection"
ADD CONSTRAINT "Inspection_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Inspection"
ADD CONSTRAINT "Inspection_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Inspection_createdById_idx" ON "Inspection"("createdById");
CREATE INDEX "Inspection_submittedById_idx" ON "Inspection"("submittedById");
CREATE INDEX "Inspection_approvedById_idx" ON "Inspection"("approvedById");
