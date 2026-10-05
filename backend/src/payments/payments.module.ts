import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProvider } from './payment.provider';
import { TariffsController } from './tariffs.controller';

@Module({
  controllers: [PaymentsController, TariffsController],
  providers: [PaymentsService, PaymentProvider],
})
export class PaymentsModule {}
