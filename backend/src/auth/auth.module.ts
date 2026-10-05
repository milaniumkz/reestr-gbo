import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SmsProvider } from './sms.provider';

@Module({
  imports: [JwtModule.register({ global: true }), AuditModule],
  controllers: [AuthController],
  providers: [AuthService, SmsProvider, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
