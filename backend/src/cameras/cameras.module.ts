import { Module } from '@nestjs/common';
import { CamerasController } from './cameras.controller';
import { CamerasService } from './cameras.service';
import { ApiKeyGuard } from './api-key.guard';

@Module({
  controllers: [CamerasController],
  providers: [CamerasService, ApiKeyGuard],
})
export class CamerasModule {}
