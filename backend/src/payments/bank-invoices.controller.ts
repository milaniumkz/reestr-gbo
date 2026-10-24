import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  Header,
} from "@nestjs/common";
import { IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { CurrentUser, RequestUser } from "../common/current-user";
import { BankInvoicesService } from "./bank-invoices.service";
class CreateBankInvoiceDto {
  @IsUUID() organizationId!: string;
  @IsString() @MaxLength(30) amount!: string;
  @IsString() @Matches(/^[a-f0-9]{32}$/) requestKey!: string;
}
@Controller("payments/bank-invoices")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("inspection_org", "operator", "super_admin")
export class BankInvoicesController {
  constructor(private readonly invoices: BankInvoicesService) {}
  @Header("Cache-Control", "private, no-store")
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() body: CreateBankInvoiceDto) {
    return this.invoices.create(
      user,
      body.organizationId,
      body.amount,
      body.requestKey,
    );
  }
  @Header("Cache-Control", "private, no-store")
  @Get()
  list(@CurrentUser() user: RequestUser, @Query("organizationId") id: string) {
    return this.invoices.list(user, id);
  }
  @Get(":id/pdf") async pdf(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Res() response: Response,
  ) {
    const pdf = await this.invoices.pdf(user, id);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${pdf.filename}"`,
    );
    response.send(pdf.bytes);
  }
}
