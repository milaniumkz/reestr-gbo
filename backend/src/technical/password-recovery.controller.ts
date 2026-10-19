import { Body, Controller, Ip, Post } from "@nestjs/common";
import { IsString, MaxLength, MinLength } from "class-validator";
import { PasswordRecoveryService } from "./password-recovery.service";
class RequestRecoveryDto {
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
    return this.recovery.request(dto.phone, ip);
  }
  @Post("complete") complete(
    @Body() dto: CompleteRecoveryDto,
    @Ip() ip: string,
  ) {
    return this.recovery.consume(dto.token, dto.password, dto.confirmation, ip);
  }
}
