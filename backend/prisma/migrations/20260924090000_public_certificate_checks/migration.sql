CREATE TABLE "PublicCertificateCheck" (
    "id" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "normalizedPlate" TEXT NOT NULL,
    "vinLast3" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "vehicleId" TEXT,
    "certificateId" TEXT,
    "certificateNumber" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "address" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicCertificateCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicCertificateCheck_createdAt_idx" ON "PublicCertificateCheck"("createdAt");
CREATE INDEX "PublicCertificateCheck_found_createdAt_idx" ON "PublicCertificateCheck"("found", "createdAt");
CREATE INDEX "PublicCertificateCheck_normalizedPlate_vinLast3_idx" ON "PublicCertificateCheck"("normalizedPlate", "vinLast3");
CREATE INDEX "PublicCertificateCheck_certificateNumber_idx" ON "PublicCertificateCheck"("certificateNumber");
