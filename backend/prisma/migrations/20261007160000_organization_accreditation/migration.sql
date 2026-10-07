ALTER TABLE "Organization"
  ADD COLUMN "accreditationValidFrom" DATE,
  ADD COLUMN "accreditationValidUntil" DATE;

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_accreditation_period_check"
  CHECK (("accreditationValidFrom" IS NULL AND "accreditationValidUntil" IS NULL) OR
    ("accreditationValidFrom" IS NOT NULL AND "accreditationValidUntil" IS NOT NULL AND
     "accreditationValidFrom" <= "accreditationValidUntil"));
