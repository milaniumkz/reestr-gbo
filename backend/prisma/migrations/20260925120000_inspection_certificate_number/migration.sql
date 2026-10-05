ALTER TABLE "Inspection" ADD COLUMN "certificateNumber" TEXT;
CREATE UNIQUE INDEX "Inspection_certificateNumber_key" ON "Inspection"("certificateNumber");
