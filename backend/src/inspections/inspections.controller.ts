import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UploadedFile, UseInterceptors } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../common/current-user";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import {
  InspectionsService,
  UploadedInspectionFile,
} from "./inspections.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inspections")
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get()
  @Roles("inspection_org", "operator", "nca", "government", "super_admin")
  list(
    @CurrentUser() user: RequestUser,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("organizationId") organizationId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    return this.inspections.list(user, page, limit, q, {
      status,
      organizationId,
      dateFrom,
      dateTo,
    });
  }

  @Post()
  @Roles("inspection_org", "operator", "super_admin")
  create(
    @CurrentUser() user: RequestUser,
    @Body()
    body: {
      organizationId: string;
      vehicleId: string;
      certificateNumber?: string;
      lat?: number | string;
      lng?: number | string;
      address?: string;
    },
  ) {
    return this.inspections.create(user, body);
  }

  @Patch(":id/status")
  @Roles("inspection_org", "operator", "nca", "super_admin")
  setStatus(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body("status") status: string,
  ) {
    return this.inspections.setStatus(user, id, status);
  }

  @Patch(":id/data")
  @Roles("inspection_org", "operator", "super_admin")
  updateData(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body()
    body: {
      vehicleId: string;
      certificateNumber?: string;
    },
  ) {
    return this.inspections.updateData(user, id, body);
  }

  @Get(":id/readiness")
  @Roles("inspection_org", "operator", "nca", "government", "super_admin")
  readiness(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.inspections.readiness(id, user);
  }

  @Get("certificate-number/:number/availability")
  @Roles("inspection_org", "operator", "super_admin")
  certificateNumberAvailability(@Param("number") number: string) {
    return this.inspections.certificateNumberAvailability(number);
  }

  @Get(":id")
  @Roles("inspection_org", "operator", "nca", "government", "super_admin")
  detail(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.inspections.detail(id, user);
  }

  @Get(":id/photos")
  @Roles("inspection_org", "operator", "nca", "government", "super_admin")
  photos(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.inspections.photos(id, user);
  }

  @Post(":id/photos")
  @Roles("inspection_org", "operator", "super_admin")
  @UseInterceptors(FileInterceptor("file"))
  uploadPhoto(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Body("type") type: string,
    @Body("lat") lat: string | undefined,
    @Body("lng") lng: string | undefined,
    @UploadedFile() file: UploadedInspectionFile,
  ) {
    return this.inspections.uploadPhoto(
      id,
      type ?? "photo",
      file,
      user,
      { lat, lng },
    );
  }
}
