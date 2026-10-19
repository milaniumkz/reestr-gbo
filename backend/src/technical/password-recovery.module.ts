import { Module } from "@nestjs/common";
import { PasswordRecoveryService } from "./password-recovery.service";
import { PasswordRecoveryController } from "./password-recovery.controller";
@Module({
  providers: [PasswordRecoveryService],
  controllers: [PasswordRecoveryController],
  exports: [PasswordRecoveryService],
})
export class PasswordRecoveryModule {}
