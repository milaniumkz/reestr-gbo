ALTER TABLE "Inspection" ADD COLUMN "usesTwoCylinders" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "secondCylinderSerial" TEXT;
ALTER TABLE "InspectionPhoto" ADD COLUMN "cylinderSerial" TEXT;
