ALTER TABLE "VehicleOwner" ADD COLUMN "phone" TEXT;
UPDATE "VehicleOwner" o SET "phone" = u."phone" FROM "User" u WHERE o."userId" = u."id" AND u."phone" NOT LIKE 'owner:%';
ALTER TABLE "VehicleOwner" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "VehicleOwner" DROP CONSTRAINT "VehicleOwner_userId_fkey";
ALTER TABLE "VehicleOwner" ADD CONSTRAINT "VehicleOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
