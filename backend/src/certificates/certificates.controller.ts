import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../common/current-user";
import { Public } from "../common/public.decorator";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import {
  CertificatesService,
  UploadedCertificateFile,
} from "./certificates.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("certificates")
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get()
  @Roles("operator", "nca", "government", "super_admin")
  list(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
    @Query("plateNumber") plateNumber?: string,
    @Query("vinLast3") vinLast3?: string,
    @Query("status") status?: string,
    @Query("organizationId") organizationId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.certificates.list(page, limit, q, {
      plateNumber,
      vinLast3,
      status,
      organizationId,
      dateFrom,
      dateTo,
    });
  }

  @Get("import-jobs")
  @Roles("inspection_org", "operator", "nca", "super_admin")
  listImportJobs(
    @CurrentUser() user: RequestUser,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("organizationId") organizationId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.certificates.listImportJobs(user, page, limit, {
      q,
      status,
      organizationId,
      dateFrom,
      dateTo,
    });
  }

  @Get("import-jobs/:id")
  @Roles("inspection_org", "operator", "nca", "super_admin")
  getImportJob(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.certificates.getImportJob(id, user);
  }

  @Get(":number")
  @Roles("inspection_org", "operator", "nca", "government", "super_admin")
  findByNumber(
    @CurrentUser() user: RequestUser,
    @Param("number") number: string,
  ) {
    return this.certificates.findByNumber(number, user);
  }

  @Patch(":number/status")
  @Roles("operator", "nca", "super_admin")
  setStatus(
    @CurrentUser() user: RequestUser,
    @Param("number") number: string,
    @Body("status") status: string,
    @Body("reason") reason?: string,
  ) {
    return this.certificates.setStatus(number, status, user, reason);
  }

  @Post("import-xlsx")
  @Roles("inspection_org", "operator", "nca", "super_admin")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  importXlsx(
    @UploadedFile() file: UploadedCertificateFile,
    @CurrentUser() user?: RequestUser,
    @Body("organizationBin") organizationBin?: string,
    @Body("ownerPhone") ownerPhone?: string,
    @Body("mode") mode?: string,
  ) {
    return this.certificates.importXlsx(file, user, {
      organizationBin,
      ownerPhone,
      mode,
    });
  }

  @Public()
  @Get(":number/verify")
  verify(@Param("number") number: string) {
    return this.certificates.verify(number);
  }

  @Public()
  @Get(":number/pdf")
  async pdf(@Param("number") number: string, @Res() response: Response) {
    const pdf = await this.certificates.pdf(number);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${pdf.filename}"`,
    );
    response.send(pdf.buffer);
  }
}
