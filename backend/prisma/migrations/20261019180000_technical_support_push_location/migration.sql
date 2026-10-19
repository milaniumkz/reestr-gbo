ALTER TABLE "TechnicalEvent" ADD COLUMN "location" JSONB;
CREATE TABLE "TechnicalPushSubscription" ("id" TEXT NOT NULL PRIMARY KEY,"accountId" TEXT NOT NULL,"endpoint" TEXT NOT NULL,"p256dh" TEXT NOT NULL,"auth" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lastSuccessAt" TIMESTAMP(3),"lastAttemptAt" TIMESTAMP(3),"lastError" TEXT,"active" BOOLEAN NOT NULL DEFAULT true);
CREATE UNIQUE INDEX "TechnicalPushSubscription_endpoint_key" ON "TechnicalPushSubscription"("endpoint");
CREATE INDEX "TechnicalPushSubscription_accountId_active_idx" ON "TechnicalPushSubscription"("accountId","active");
CREATE TABLE "TechnicalPushDelivery" ("subscriptionId" TEXT NOT NULL,"alertId" TEXT NOT NULL,"state" TEXT NOT NULL DEFAULT 'pending',"attempts" INTEGER NOT NULL DEFAULT 0,"nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lastError" TEXT,"sentAt" TIMESTAMP(3),PRIMARY KEY ("subscriptionId","alertId"));
CREATE TABLE "InspectionDeviation" ("id" TEXT NOT NULL PRIMARY KEY,"dedupKey" TEXT NOT NULL,"inspectionId" TEXT NOT NULL,"kind" TEXT NOT NULL,"severity" TEXT NOT NULL DEFAULT 'warning',"explanation" TEXT NOT NULL,"facts" JSONB NOT NULL,"status" TEXT NOT NULL DEFAULT 'new',"firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"reviewedBy" TEXT,"reviewedAt" TIMESTAMP(3),"reviewNote" TEXT);
CREATE UNIQUE INDEX "InspectionDeviation_dedupKey_key" ON "InspectionDeviation"("dedupKey");
CREATE INDEX "InspectionDeviation_inspectionId_idx" ON "InspectionDeviation"("inspectionId");
CREATE INDEX "InspectionDeviation_status_lastSeenAt_idx" ON "InspectionDeviation"("status","lastSeenAt");
