ALTER TABLE "Organization" ADD COLUMN "legalName" TEXT;
ALTER TABLE "Organization" ADD COLUMN "billingNumber" SERIAL NOT NULL;
CREATE UNIQUE INDEX "Organization_billingNumber_key" ON "Organization"("billingNumber");
CREATE TABLE "BankInvoice" (
 "id" TEXT NOT NULL, "number" SERIAL NOT NULL, "organizationId" TEXT, "issuedById" TEXT,
 "requestKey" TEXT NOT NULL, "amountMinor" BIGINT NOT NULL, "currency" TEXT NOT NULL DEFAULT 'KZT',
 "status" TEXT NOT NULL DEFAULT 'issued', "snapshot" JSONB NOT NULL, "pdf" BYTEA NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "BankInvoice_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "BankInvoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "BankInvoice_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "BankInvoice_amount_positive" CHECK ("amountMinor" > 0)
);
CREATE UNIQUE INDEX "BankInvoice_number_key" ON "BankInvoice"("number");
CREATE UNIQUE INDEX "BankInvoice_organizationId_requestKey_key" ON "BankInvoice"("organizationId","requestKey");
CREATE INDEX "BankInvoice_organizationId_createdAt_idx" ON "BankInvoice"("organizationId","createdAt");
