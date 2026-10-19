import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {RolesGuard} from '../common/roles.guard';
import {Roles} from '../common/roles.decorator';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Public()
  basic() {
    return this.health.basic();
  }

  @Get('deep')
  @UseGuards(JwtAuthGuard,RolesGuard)
  @Roles('super_admin')
  deep() {
    return this.health.deep();
  }
}
