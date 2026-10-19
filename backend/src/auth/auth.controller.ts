import { Body, Controller, Get, Ip, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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

class PasswordLoginDto {
  @IsString() @MaxLength(32) phone!: string;
  @IsString() @MaxLength(72) password!: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() bin?: string;
  @IsOptional() @IsString() @MaxLength(120) deviceName?: string;
}
class ChangeInitialPasswordDto {
  @IsString() @MaxLength(4096) passwordChangeToken!: string;
  @IsString() @MinLength(8) @MaxLength(72) newPassword!: string;
  @IsString() @MaxLength(72) confirmation!: string;
}

class RefreshDto {
  @IsString()
  refreshToken!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: PasswordLoginDto, @Ip() ipAddress: string) {
    return this.auth.login(dto.phone,dto.password,dto,ipAddress);
  }

  @Post('password/change')
  changePassword(@Body() dto: ChangeInitialPasswordDto, @Ip() ipAddress: string) {
    return this.auth.changeInitialPassword(dto.passwordChangeToken,dto.newPassword,dto.confirmation,ipAddress);
  }

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
