ALTER TABLE "Notification" ADD COLUMN "dedupKey" TEXT, ADD COLUMN "organizationId" TEXT, ADD COLUMN "entity" TEXT, ADD COLUMN "entityId" TEXT;
CREATE UNIQUE INDEX "Notification_dedupKey_key" ON "Notification"("dedupKey");
