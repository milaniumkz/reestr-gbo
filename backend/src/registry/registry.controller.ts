import { Controller, Get, Headers, Ip, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CurrentUser, RequestUser } from '../common/current-user';
import { RegistryService } from './registry.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('registry')
export class RegistryController {
  constructor(private readonly registry: RegistryService) {}

  @Get('search')
  @Roles('vehicle_owner', 'inspection_org', 'operator', 'nca', 'government', 'super_admin')
  search(
    @CurrentUser() user: RequestUser,
    @Query('q') q = '',
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('status') status?: string,
    @Query('organizationId') organizationId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.registry.search(user, q, limit, page, {
      status,
      organizationId,
      dateFrom,
      dateTo,
    });
  }

  @Get('public-checks')
  @Roles('operator', 'nca', 'government', 'super_admin')
  publicChecks(
    @Query('q') q = '',
    @Query('found') found?: string,
    @Query('plate') plate?: string,
    @Query('certificateNumber') certificateNumber?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.registry.publicCertificateChecks(q, found, limit, {
      plate,
      certificateNumber,
      dateFrom,
      dateTo,
    }, page);
  }

  @Public()
  @Get('public-check')
  publicCheck(
    @Query('plateNumber') plateNumber = '',
    @Query('vinLast3') vinLast3 = '',
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Ip() ipAddress?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.registry.publicCertificateCheck(plateNumber, vinLast3, {
      lat,
      lng,
      ipAddress,
      userAgent,
    });
  }
}
