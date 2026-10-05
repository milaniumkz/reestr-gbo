import { Body, Controller, Get, Ip, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser, RequestUser } from '../common/current-user';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';

class SendOtpDto {
  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  role?: string;
}

class VerifyOtpDto {
  @IsString()
  phone!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  bin?: string;

  @IsOptional()
  @IsString()
  deviceName?: string;
}

class RefreshDto {
  @IsString()
  refreshToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/send')
  sendOtp(@Body() dto: SendOtpDto, @Ip() ipAddress: string) {
    return this.auth.sendOtp(dto.phone, ipAddress, dto.role);
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyOtpDto, @Ip() ipAddress: string) {
    return this.auth.verifyOtp(dto.phone, dto.code, dto.deviceName, ipAddress, dto.role, dto.bin);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Ip() ipAddress: string) {
    return this.auth.refresh(dto.refreshToken, ipAddress);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user?: RequestUser, @Ip() ipAddress?: string) {
    return this.auth.logout(user, ipAddress);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user?: RequestUser) {
    return user;
  }
}
