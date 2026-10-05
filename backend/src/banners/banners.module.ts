import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [BannersController],
  providers: [BannersService],
})
export class BannersModule {}
