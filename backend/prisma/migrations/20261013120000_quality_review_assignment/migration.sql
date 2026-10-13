ALTER TABLE "Inspection" ADD COLUMN "qualityReviewerId" TEXT, ADD COLUMN "qualityReviewStartedAt" TIMESTAMP(3);
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_qualityReviewerId_fkey" FOREIGN KEY ("qualityReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
