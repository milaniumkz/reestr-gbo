-- Earlier environments used schema push for these existing application fields.
-- Additive/idempotent: preserve existing values and indexes on deployed databases.
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "autoPublishAt" TIMESTAMP(3);
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
ALTER TABLE "VehicleOwner" ADD COLUMN IF NOT EXISTS "address" TEXT;
