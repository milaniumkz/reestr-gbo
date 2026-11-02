-- Existing records retain their actual data; no second-cylinder values are inferred.
ALTER TABLE "GasCylinder" ADD COLUMN "shape" TEXT;
ALTER TABLE "Inspection"
 ADD COLUMN "secondCylinderManufacturer" TEXT,
 ADD COLUMN "secondCylinderVolumeLiters" INTEGER,
 ADD COLUMN "secondCylinderShape" TEXT,
 ADD COLUMN "secondCylinderProducedAt" TIMESTAMP(3),
 ADD COLUMN "secondCylinderInspectedAt" TIMESTAMP(3),
 ADD COLUMN "secondCylinderValidUntil" TIMESTAMP(3),
 ADD COLUMN "secondQualityDocumentUploadedAt" TIMESTAMP(3);
