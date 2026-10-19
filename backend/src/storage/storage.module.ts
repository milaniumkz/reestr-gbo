import {MediaController} from './media.controller';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageService } from './storage.service';

@Module({
  imports: [PrismaModule],
  providers: [StorageService],
  controllers: [MediaController],
  exports: [StorageService],
})
export class StorageModule {}
