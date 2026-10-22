import {
  Body,
  Controller,
  Ip,
  Post,
  Get,
  Param,
  UseGuards,
  Header,
} from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { PasswordRecoveryService } from "./password-recovery.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../common/current-user";
class RequestRecoveryDto {
  @IsString() @MaxLength(12) bin!: string;
  @IsString() @MaxLength(200) fullName!: string;
  @IsString() @MaxLength(32) phone!: string;
}
class CompleteRecoveryDto {
  @IsString() @MaxLength(128) token!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @IsString() @MaxLength(72) confirmation!: string;
}
@Controller("auth/recovery")
export class PasswordRecoveryController {
  constructor(private readonly recovery: PasswordRecoveryService) {}
  @Post("request") request(@Body() dto: RequestRecoveryDto, @Ip() ip: string) {
    return this.recovery.request(dto.phone, ip, dto.bin, dto.fullName);
  }
  @UseGuards(JwtAuthGuard)
  @Header("Cache-Control", "no-store")
  @Get("requests")
  requests(@CurrentUser() user: RequestUser) {
    return this.recovery.requests(user.sub);
  }
  @UseGuards(JwtAuthGuard)
  @Header("Cache-Control", "no-store")
  @Post("requests/:id/approve")
  approve(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.recovery.approve(id, user.sub);
  }
  @Post("complete") complete(
    @Body() dto: CompleteRecoveryDto,
    @Ip() ip: string,
  ) {
    return this.recovery.consume(dto.token, dto.password, dto.confirmation, ip);
  }
}
