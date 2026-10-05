CREATE TABLE "GboEquipmentItem" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GboEquipmentItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GboEquipmentItem_type_name_key" ON "GboEquipmentItem"("type", "name");
CREATE INDEX "GboEquipmentItem_type_isActive_idx" ON "GboEquipmentItem"("type", "isActive");
