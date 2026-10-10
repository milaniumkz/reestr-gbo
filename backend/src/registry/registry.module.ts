import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { RegistryController } from './registry.controller';
import { RegistryService } from './registry.service';

@Module({
  imports: [StorageModule],
  controllers: [RegistryController],
  providers: [RegistryService],
})
export class RegistryModule {}
