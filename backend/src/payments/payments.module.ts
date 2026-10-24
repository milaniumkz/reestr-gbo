import { BankInvoicesService } from './bank-invoices.service';
import { BankInvoicesController } from './bank-invoices.controller';
import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentProvider } from './payment.provider';
import { TariffsController } from './tariffs.controller';

@Module({
  controllers: [BankInvoicesController, PaymentsController, TariffsController],
  providers: [BankInvoicesService, PaymentsService, PaymentProvider],
})
export class PaymentsModule {}
