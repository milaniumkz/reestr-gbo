import { TechnicalWatchdog } from "./technical-watchdog.service";
import { Module } from "@nestjs/common";
import { TechnicalAuthService } from "./technical-auth.service";
import { TechnicalGuard } from "./technical.guard";
import {
  TechnicalController,
  TechnicalLoginController,
} from "./technical.controller";
import { TechnicalData } from "./technical-data.service";
import { TechnicalMonitor } from "./technical-monitor.service";
import { PasswordRecoveryModule } from "./password-recovery.module";
import { StorageModule } from "../storage/storage.module";
import { InspectionsModule } from "../inspections/inspections.module";
import { CityRiskService } from "./city-risk.service";
@Module({
  imports: [PasswordRecoveryModule, StorageModule, InspectionsModule],
  providers: [
    TechnicalAuthService,
    TechnicalGuard,
    TechnicalData,
    TechnicalMonitor,
    CityRiskService,
    TechnicalWatchdog,
  ],
  controllers: [TechnicalController, TechnicalLoginController],
})
export class TechnicalModule {}
