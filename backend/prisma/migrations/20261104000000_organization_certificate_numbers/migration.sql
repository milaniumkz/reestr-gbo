-- Preserve every existing human-readable number and link certificates to their issuing IO.
ALTER TABLE "Certificate" ADD COLUMN "organizationId" TEXT;
UPDATE "Certificate" AS c SET "organizationId" = i."organizationId" FROM "Inspection" AS i WHERE c."inspectionId" = i."id";
ALTER TABLE "Certificate" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Inspection_id_organizationId_key" ON "Inspection"("id", "organizationId");
ALTER TABLE "Certificate" DROP CONSTRAINT "Certificate_inspectionId_fkey";
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_inspectionId_organizationId_fkey" FOREIGN KEY ("inspectionId", "organizationId") REFERENCES "Inspection"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Certificate_organizationId_number_key" ON "Certificate"("organizationId", "number");
CREATE UNIQUE INDEX "Certificate_inspectionId_organizationId_key" ON "Certificate"("inspectionId", "organizationId");
CREATE INDEX "Certificate_number_idx" ON "Certificate"("number");
CREATE UNIQUE INDEX "Inspection_organizationId_certificateNumber_key" ON "Inspection"("organizationId", "certificateNumber");
DROP INDEX "Certificate_number_key";
DROP INDEX "Inspection_certificateNumber_key";
-- The same workbook can have separate jobs in separate IOs; failed unassigned jobs remain nullable.
UPDATE "CertificateImportJob" AS j SET "organizationId" = c."organizationId" FROM "Certificate" AS c WHERE j."certificateId" = c."id" AND j."organizationId" IS DISTINCT FROM c."organizationId";
CREATE UNIQUE INDEX "CertificateImportJob_organizationId_fileHash_filename_key" ON "CertificateImportJob"("organizationId", "fileHash", "filename");
DROP INDEX "CertificateImportJob_fileHash_filename_key";
