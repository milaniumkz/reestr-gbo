CREATE TABLE "OtpChallenge" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'login',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OtpChallenge_phone_purpose_createdAt_idx" ON "OtpChallenge"("phone", "purpose", "createdAt");

CREATE TABLE "StorageObject" (
  "id" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "contentType" TEXT,
  "sizeBytes" INTEGER NOT NULL,
  "checksum" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorageObject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorageObject_objectKey_key" ON "StorageObject"("objectKey");

CREATE TABLE "CertificateImportJob" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "filename" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "organizationId" TEXT,
  "certificateId" TEXT,
  "createdById" TEXT,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "CertificateImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CertificateImportJob_status_createdAt_idx" ON "CertificateImportJob"("status", "createdAt");
CREATE UNIQUE INDEX "CertificateImportJob_fileHash_filename_key" ON "CertificateImportJob"("fileHash", "filename");

CREATE TABLE "CertificateImportError" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "field" TEXT,
  "message" TEXT NOT NULL,
  "rawValue" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CertificateImportError_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CertificateImportJob"
  ADD CONSTRAINT "CertificateImportJob_certificateId_fkey"
  FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CertificateImportError"
  ADD CONSTRAINT "CertificateImportError_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "CertificateImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
