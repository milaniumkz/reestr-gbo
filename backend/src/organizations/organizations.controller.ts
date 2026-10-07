import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { OrganizationsService } from './organizations.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @Roles('vehicle_owner', 'inspection_org', 'operator', 'nca', 'government', 'super_admin')
  list(
    @CurrentUser() user: RequestUser,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('region') region?: string,
  ) {
    return this.organizations.list(user, type, page, limit, q, { status, region });
  }

  @Get(':id')
  @Roles('operator', 'nca', 'super_admin')
  detail(@Param('id') id: string) {
    return this.organizations.detail(id);
  }

  @Get(':id/activity')
  @Roles('operator', 'nca', 'super_admin')
  activity(@Param('id') id: string) {
    return this.organizations.activity(id);
  }

  @Post()
  @Roles('operator', 'nca', 'super_admin')
  create(@CurrentUser() user: RequestUser, @Body() body: {
    type: string;
    name: string;
    bin: string;
    address?: string;
    region?: string;
    contactPhone?: string;
    contactEmail?: string;
    accreditationValidFrom?: string;
    accreditationValidUntil?: string;
    lat?: number;
    lng?: number;
  }) {
    return this.organizations.create(user, body);
  }

  @Patch(':id/status')
  @Roles('operator', 'nca', 'super_admin')
  setStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('reason') reason?: string,
  ) {
    return this.organizations.setStatus(user, id, status, reason);
  }

  @Patch(':id')
  @Roles('operator', 'nca', 'super_admin')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      bin?: string;
      address?: string | null;
      region?: string | null;
      contactPhone?: string | null;
      contactEmail?: string | null;
      accreditationValidFrom?: string;
      accreditationValidUntil?: string;
      lat?: number | string | null;
      lng?: number | string | null;
    },
  ) {
    return this.organizations.update(user, id, body);
  }

  @Delete(':id')
  @Roles('operator', 'nca', 'super_admin')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.organizations.remove(user, id);
  }

  @Post(':id/members')
  @Roles('inspection_org', 'operator', 'nca', 'super_admin')
  addMember(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: { userId?: string; role: string; fullName?: string; phone?: string; iin?: string },
  ) {
    return this.organizations.addMember(user, id, body);
  }

  @Delete(':id/members/:memberId')
  @Roles('inspection_org', 'operator', 'nca', 'super_admin')
  removeMember(@CurrentUser() user: RequestUser, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.organizations.removeMember(user, id, memberId);
  }
}
