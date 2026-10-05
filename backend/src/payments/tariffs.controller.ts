import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { listResponse, paginationMeta } from '../common/pagination';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tariffs')
export class TariffsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('inspection_org', 'operator', 'super_admin')
  async list(@Query('page') page?: string, @Query('limit') limit?: string) {
    const meta = paginationMeta(page, limit);
    const [items, total] = await Promise.all([
      this.prisma.tariff.findMany({
        orderBy: { createdAt: 'desc' },
        skip: meta.skip,
        take: meta.limit,
      }),
      this.prisma.tariff.count(),
    ]);
    return listResponse(items, total, page, limit);
  }

  @Post()
  @Roles('operator', 'super_admin')
  create(@Body() body: { code: string; name: string; amount: number; periodDays?: number }) {
    return this.prisma.tariff.create({
      data: {
        code: body.code,
        name: body.name,
        amount: body.amount,
        periodDays: body.periodDays,
      },
    });
  }

  @Patch(':code/toggle')
  @Roles('operator', 'super_admin')
  async toggle(@Param('code') code: string, @Body('isActive') isActive: boolean) {
    return this.prisma.tariff.update({
      where: { code },
      data: { isActive },
    });
  }
}
