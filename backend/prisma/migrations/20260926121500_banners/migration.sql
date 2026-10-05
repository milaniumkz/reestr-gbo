CREATE TABLE "Banner" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "linkUrl" TEXT,
  "objectKey" TEXT NOT NULL,
  "durationSeconds" INTEGER NOT NULL DEFAULT 5,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);
