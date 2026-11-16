import { LocalPhotoDeviceService } from '../photo-moderation/local-photo-device.service';
import { TechPassportService } from '../tech-passport/tech-passport.service';
import { PhotoModerationService } from '../photo-moderation/photo-moderation.service';
import { Module } from '@nestjs/common';
import { CertificatesModule } from '../certificates/certificates.module';
import { StorageModule } from '../storage/storage.module';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';

@Module({
  imports: [CertificatesModule, StorageModule],
  controllers: [InspectionsController],
  providers: [InspectionsService, PhotoModerationService,TechPassportService,LocalPhotoDeviceService],
  exports: [PhotoModerationService],
})
export class InspectionsModule {}
