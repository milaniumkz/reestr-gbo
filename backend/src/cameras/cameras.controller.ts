import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ApiKeyGuard } from './api-key.guard';
import { CamerasService } from './cameras.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cameras')
export class CamerasController {
  constructor(private readonly cameras: CamerasService) {}

  @Get()
  @Roles('inspection_org', 'operator', 'nca', 'super_admin')
  list(@CurrentUser() user: RequestUser) {
    return this.cameras.list(user);
  }

  @Post()
  @Roles('operator', 'nca', 'super_admin')
  create(@Body() body: {
    organizationId: string;
    name: string;
    rtspUrl: string;
    hlsPath?: string;
  }) {
    return this.cameras.create(body);
  }

  @Post(':id/session')
  @Roles('operator', 'nca', 'super_admin')
  startSession(@Param('id') id: string) {
    return this.cameras.startSession(id);
  }

  @Get('sessions')
  @Roles('operator', 'nca', 'super_admin')
  sessions() {
    return this.cameras.sessions();
  }

  @Patch('sessions/:id/end')
  @Roles('operator', 'nca', 'super_admin')
  endSession(@Param('id') id: string) {
    return this.cameras.endSession(id);
  }

  @Get('api-tokens')
  @Roles('operator', 'nca', 'super_admin')
  listTokens() {
    return this.cameras.listTokens();
  }

  @Post('api-tokens')
  @Roles('operator', 'nca', 'super_admin')
  createToken(@Body() body: { organizationId: string; name: string; scopes?: string[] }) {
    return this.cameras.createToken(body);
  }

  @Patch('api-tokens/:id/revoke')
  @Roles('operator', 'nca', 'super_admin')
  revokeToken(@Param('id') id: string) {
    return this.cameras.revokeToken(id);
  }

  @Public()
  @UseGuards(ApiKeyGuard)
  @Get('external')
  externalCameras(@Req() request: { apiToken: { organizationId: string } }) {
    return this.cameras.listForOrganization(request.apiToken.organizationId);
  }

  @Public()
  @UseGuards(ApiKeyGuard)
  @Post('external/:id/session')
  externalSession(
    @Param('id') id: string,
    @Req() request: { apiToken: { organizationId: string } },
  ) {
    return this.cameras.startExternalSession(request.apiToken.organizationId, id);
  }
}
