import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { EquipmentService } from './equipment.service';

@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Public()
  @Get('public')
  publicList() {
    return this.equipment.publicList();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  @Roles('operator', 'nca', 'super_admin')
  list() {
    return this.equipment.list();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  @Roles('operator', 'nca', 'super_admin')
  create(@Body() body: { type?: string; name?: string }) {
    return this.equipment.create(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id')
  @Roles('operator', 'nca', 'super_admin')
  update(@Param('id') id: string, @Body() body: { type?: string; name?: string }) {
    return this.equipment.update(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id/active')
  @Roles('operator', 'nca', 'super_admin')
  setActive(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.equipment.setActive(id, Boolean(isActive));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  @Roles('operator', 'nca', 'super_admin')
  remove(@Param('id') id: string) {
    return this.equipment.remove(id);
  }
}
