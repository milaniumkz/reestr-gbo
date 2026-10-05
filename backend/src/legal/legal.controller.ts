import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { LegalService } from './legal.service';

@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Public()
  @Get('public/active')
  publicActive() {
    return this.legal.publicActive();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  @Roles('operator', 'nca', 'super_admin')
  list() {
    return this.legal.list();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  @Roles('operator', 'nca', 'super_admin')
  create(@Body() body: { title?: string; excerpt?: string; body?: string }) {
    return this.legal.create(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id')
  @Roles('operator', 'nca', 'super_admin')
  update(@Param('id') id: string, @Body() body: { title?: string; excerpt?: string; body?: string; isActive?: boolean }) {
    return this.legal.update(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  @Roles('operator', 'nca', 'super_admin')
  remove(@Param('id') id: string) {
    return this.legal.remove(id);
  }
}
