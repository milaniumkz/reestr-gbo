import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { BannersService, UploadedBannerFile } from './banners.service';

@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  @Public()
  @Get('public')
  publicList() {
    return this.banners.publicList();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  @Roles('operator', 'nca', 'super_admin')
  list() {
    return this.banners.list();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  @Roles('operator', 'nca', 'super_admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  create(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: UploadedBannerFile,
    @Body() body: { title?: string; linkUrl?: string; durationSeconds?: string; startsAt?: string; endsAt?: string },
  ) {
    return this.banners.create(user, file, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id/active')
  @Roles('operator', 'nca', 'super_admin')
  setActive(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.banners.setActive(id, Boolean(isActive));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  @Roles('operator', 'nca', 'super_admin')
  remove(@Param('id') id: string) {
    return this.banners.remove(id);
  }
}
