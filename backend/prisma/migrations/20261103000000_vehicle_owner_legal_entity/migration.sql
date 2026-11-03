ALTER TABLE "VehicleOwner" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'individual', ADD COLUMN "bin" TEXT;
CREATE INDEX "VehicleOwner_bin_idx" ON "VehicleOwner"("bin");
