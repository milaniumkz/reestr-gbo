import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../common/current-user';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PaymentsService } from './payments.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Roles('inspection_org', 'operator', 'super_admin')
  list(@CurrentUser() user: RequestUser, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.payments.list(user, page, limit);
  }

  @Post('invoice')
  @Roles('inspection_org', 'operator', 'super_admin')
  createInvoice(
    @CurrentUser() user: RequestUser,
    @Body() body: { amount?: number; purpose?: string; organizationId?: string; tariffCode?: string },
  ) {
    return this.payments.createInvoice(user, body);
  }

  @Post('webhook/:provider')
  @Public()
  webhook(
    @Param('provider') provider: string,
    @Body() payload: unknown,
    @Headers('x-ersi-signature') signature?: string,
  ) {
    return this.payments.handleWebhook(provider, payload, signature);
  }
}
