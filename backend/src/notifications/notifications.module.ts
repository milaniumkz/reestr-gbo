import {WebReleaseController} from './web-release.controller';
import {WebReleaseService} from './web-release.service';
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';

@Module({ controllers: [NotificationsController,WebReleaseController],providers:[WebReleaseService] })
export class NotificationsModule {}
