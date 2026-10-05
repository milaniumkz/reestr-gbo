ALTER TABLE "Vehicle" ADD COLUMN "normalizedPlate" TEXT;
ALTER TABLE "Vehicle" ADD COLUMN "vinLast3" TEXT;

UPDATE "Vehicle"
SET
  "normalizedPlate" = upper(regexp_replace("plateNumber", '[^0-9A-Za-zА-Яа-я]', '', 'g')),
  "vinLast3" = upper(right("vin", 3));

CREATE INDEX "Vehicle_normalizedPlate_vinLast3_idx" ON "Vehicle"("normalizedPlate", "vinLast3");
