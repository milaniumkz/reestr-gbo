import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { VehiclesService } from './vehicles.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  @Roles('inspection_org', 'operator', 'nca', 'government', 'super_admin')
  list(@Query('q') q?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.vehicles.list(q, page, limit);
  }

  @Get(':id')
  @Roles('inspection_org', 'operator', 'nca', 'government', 'super_admin')
  find(@Param('id') id: string) {
    return this.vehicles.find(id);
  }

  @Post()
  @Roles('inspection_org', 'operator', 'super_admin')
  create(@CurrentUser() user: RequestUser, @Body() body: {
    vin: string;
    plateNumber: string;
    make: string;
    model: string;
    year?: number;
    owner: { phone: string; fullName: string; iin?: string; address?: string };
    cylinder: {
      serialNumber: string;
      manufacturer: string;
      volumeLiters: number;
      reducerName?: string;
      controlUnitName?: string;
      producedAt?: string;
      validUntil: string;
    };
  }) {
    return this.vehicles.create(body, user);
  }
}
