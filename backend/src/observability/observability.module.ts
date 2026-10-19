import { BusinessAuditBridge } from "./business-audit-bridge.service";
import { Global, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { EventLedger } from "./event-ledger.service";
import { SafeExceptionFilter } from "./http-observability";
@Global()
@Module({
  providers: [
    EventLedger,
    BusinessAuditBridge,
    { provide: APP_FILTER, useClass: SafeExceptionFilter },
  ],
  exports: [EventLedger],
})
export class ObservabilityModule {}
