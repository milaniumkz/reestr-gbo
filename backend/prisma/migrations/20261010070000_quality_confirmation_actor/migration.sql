ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_qualityConfirmedById_fkey" FOREIGN KEY ("qualityConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
