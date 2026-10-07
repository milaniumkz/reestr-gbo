import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { existsSync } from "fs";
import { Prisma } from "@prisma/client";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import PDFDocument from "pdfkit";
import {
  assertOrganizationAccess,
  hasGlobalAccess,
  userOrganizationIds,
} from "../common/access-scope";
import { listResponse, paginationMeta } from "../common/pagination";
import { RequestUser } from "../common/current-user";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

export type UploadedCertificateFile = {
  originalname: string;
  buffer: Buffer;
  mimetype?: string;
};

type CertificateListFilters = {
  plateNumber?: string;
  vinLast3?: string;
  status?: string;
  organizationId?: string;
  dateFrom?: string;
  dateTo?: string;
};

class IncompleteCertificateXlsxError extends Error {
  constructor(
    readonly missing: string[],
    readonly partial: Record<string, unknown>,
  ) {
    super("Required fields not found in XLSX");
  }
}

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(
    page?: string,
    limit?: string,
    q?: string,
    filters: CertificateListFilters = {},
  ) {
    const query = q?.trim();
    const plateNumber = this.normalizeLookup(filters.plateNumber);
    const vinLast3 = this.normalizeLookup(filters.vinLast3);
    const status = filters.status?.trim();
    const requestedOrganizationId = filters.organizationId?.trim();
    const organizationId =
      requestedOrganizationId && requestedOrganizationId !== "all"
        ? requestedOrganizationId
        : undefined;
    const issuedAt = this.dateRange(filters.dateFrom, filters.dateTo);
    const meta = paginationMeta(page, limit);
    const where: Prisma.CertificateWhereInput = {
      ...(status && status !== "all" ? { status } : {}),
      ...(organizationId ? { inspection: { organizationId } } : {}),
      ...(issuedAt ? { issuedAt } : {}),
      ...(plateNumber || vinLast3
        ? {
            vehicle: {
              ...(plateNumber ? { normalizedPlate: plateNumber } : {}),
              ...(vinLast3 ? { vinLast3 } : {}),
            },
          }
        : {}),
      ...(query
        ? {
            OR: [
              { number: { contains: query, mode: "insensitive" as const } },
              { vehicle: { vin: { contains: query, mode: "insensitive" as const } } },
              {
                vehicle: {
                  plateNumber: { contains: query, mode: "insensitive" as const },
                },
              },
              {
                inspection: {
                  organization: {
                    name: { contains: query, mode: "insensitive" as const },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [certificates, totalBeforePostFilter] = await Promise.all([
      this.prisma.certificate.findMany({
        where,
        include: {
          vehicle: {
            include: { owners: { include: { user: true } }, cylinders: true },
          },
          inspection: { include: this.inspectionInclude() },
          _count: { select: { views: true } },
        },
        orderBy: { issuedAt: "desc" },
        skip: meta.skip,
        take: meta.limit,
      }),
      this.prisma.certificate.count({ where }),
    ]);
    const items = certificates.map((certificate) => ({
      ...certificate,
      inspection: {
        ...certificate.inspection,
        photos: certificate.inspection.photos.map((photo) => ({
          ...photo,
          viewUrl: this.storage.objectUrl(photo.objectKey).url,
        })),
      },
    }));
    return listResponse(items, totalBeforePostFilter, page, limit);
  }

  private normalizeLookup(value?: string | null) {
    return (value ?? "").replace(/[^0-9a-zA-Zа-яА-Я]/g, "").toUpperCase();
  }

  private inspectionInclude() {
    return {
      organization: true,
      photos: true,
      createdBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
      submittedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
      approvedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
    };
  }

  private importedInspectionInclude() {
    return {
      organization: true,
      certificate: true,
      photos: true,
      vehicle: { include: { owners: { include: { user: true } }, cylinders: true } },
      createdBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
      submittedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
      approvedBy: { select: { id: true, phone: true, fullName: true, lastLoginAt: true } },
    };
  }

  private vehicleVinLast3(value?: string | null) {
    return (value ?? "").trim().toUpperCase().slice(-3);
  }

  private dateRange(dateFrom?: string, dateTo?: string) {
    const range: { gte?: Date; lte?: Date } = {};
    const from = this.parseFilterDate(dateFrom, false);
    const to = this.parseFilterDate(dateTo, true);
    if (from) range.gte = from;
    if (to) range.lte = to;
    return range.gte || range.lte ? range : undefined;
  }

  private parseFilterDate(value?: string, endOfDay = false) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    if (endOfDay) date.setHours(23, 59, 59, 999);
    else date.setHours(0, 0, 0, 0);
    return date;
  }

  async listImportJobs(
    user?: RequestUser,
    page?: string,
    limit?: string,
    filters: {
      q?: string;
      status?: string;
      organizationId?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) {
    const organizationIds = hasGlobalAccess(user)
      ? undefined
      : await userOrganizationIds(this.prisma, user);
    const query = filters.q?.trim();
    const requestedOrganizationId = filters.organizationId?.trim();
    const scopedOrganizationIds = requestedOrganizationId && requestedOrganizationId !== "all"
      ? organizationIds?.includes(requestedOrganizationId) || hasGlobalAccess(user)
        ? [requestedOrganizationId]
        : []
      : organizationIds;
    const createdAt = {
      ...(this.parseFilterDate(filters.dateFrom)
        ? { gte: this.parseFilterDate(filters.dateFrom) }
        : {}),
      ...(this.parseFilterDate(filters.dateTo, true)
        ? { lte: this.parseFilterDate(filters.dateTo, true) }
        : {}),
    };
    const where = {
      ...(scopedOrganizationIds
        ? { organizationId: { in: scopedOrganizationIds } }
        : {}),
      ...(filters.status?.trim() && filters.status !== "all"
        ? { status: filters.status.trim() }
        : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(query
        ? {
            OR: [
              { filename: { contains: query, mode: "insensitive" as const } },
              { objectKey: { contains: query, mode: "insensitive" as const } },
              {
                certificate: {
                  number: { contains: query, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    };
    const meta = paginationMeta(page, limit);
    const [items, total] = await Promise.all([
      this.prisma.certificateImportJob.findMany({
        where,
        include: {
          organization: true,
          certificate: { include: { vehicle: true } },
          errors: true,
        },
        orderBy: { createdAt: "desc" },
        skip: meta.skip,
        take: meta.limit,
      }),
      this.prisma.certificateImportJob.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  async getImportJob(id: string, user?: RequestUser) {
    const job = await this.prisma.certificateImportJob.findUnique({
      where: { id },
      include: {
        organization: true,
        certificate: {
          include: {
            vehicle: {
              include: { owners: { include: { user: true } }, cylinders: true },
            },
            inspection: { include: { organization: true } },
          },
        },
        errors: true,
      },
    });
    if (!job) throw new NotFoundException("Import job not found");
    if (job.organizationId) {
      await assertOrganizationAccess(this.prisma, job.organizationId, user);
    }
    return job;
  }

  async issueForInspection(inspectionId: string) {
    const existing = await this.prisma.certificate.findUnique({
      where: { inspectionId },
    });
    if (existing) return existing;

    const inspection = await this.prisma.inspection.findUnique({
      where: { id: inspectionId },
      include: { vehicle: true },
    });
    if (!inspection) throw new NotFoundException("Inspection not found");

    const validUntil = new Date();
    validUntil.setFullYear(validUntil.getFullYear() + 2);

    const number =
      inspection.certificateNumber?.trim() || (await this.nextNumber());
    const existingByNumber = await this.prisma.certificate.findUnique({
      where: { number },
    });
    if (existingByNumber) {
      throw new BadRequestException(
        "Свидетельство с таким номером уже есть в системе",
      );
    }
    return this.prisma.certificate.create({
      data: {
        number,
        vehicleId: inspection.vehicleId,
        inspectionId,
        validUntil,
        qrPayload: `${number}:${inspection.vehicle.vin}`,
      },
    });
  }

  async findByNumber(number: string, user?: RequestUser) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { number },
      include: {
        vehicle: {
          include: { owners: { include: { user: true } }, cylinders: true },
        },
        inspection: { include: this.inspectionInclude() },
      },
    });
    if (!certificate) throw new NotFoundException("Certificate not found");
    await assertOrganizationAccess(
      this.prisma,
      certificate.inspection.organizationId,
      user,
    );
    return {
      ...certificate,
      inspection: {
        ...certificate.inspection,
        photos: certificate.inspection.photos.map((photo) => ({
          ...photo,
          viewUrl: this.storage.objectUrl(photo.objectKey).url,
        })),
      },
    };
  }

  async setStatus(
    number: string,
    status: string,
    user?: RequestUser,
    reason?: string,
  ) {
    if (!["active", "suspended", "revoked"].includes(status)) {
      throw new BadRequestException("Некорректный статус свидетельства");
    }
    const trimmedReason = reason?.trim();
    if (status !== "active" && !trimmedReason) {
      throw new BadRequestException("Укажите причину ограничения свидетельства");
    }
    const previous = await this.prisma.certificate.findUnique({
      where: { number },
      select: { id: true, status: true },
    });
    const certificate = await this.prisma.certificate.update({
      where: { number },
      data: { status },
      include: {
        vehicle: true,
        inspection: { include: { organization: true } },
        _count: { select: { views: true } },
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: user?.sub,
        action: "certificate.status.update",
        entity: "certificate",
        entityId: certificate.number,
        metadata: {
          previousStatus: previous?.status ?? null,
          status: certificate.status,
          certificateId: certificate.id,
          reason: trimmedReason || null,
        },
      },
    });
    return certificate;
  }

  async verify(number: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { number },
      include: { inspection: { select: { organization: { select: {
        name: true, bin: true, accreditationValidFrom: true, accreditationValidUntil: true,
      } } } } },
    });
    if (!certificate) return { valid: false, status: "not_found" };
    const valid =
      certificate.status === "active" && certificate.validUntil > new Date();
    await this.prisma.certificateView.create({
      data: { certificateId: certificate.id },
    });
    return {
      valid,
      status: certificate.status,
      number: certificate.number,
      validUntil: certificate.validUntil,
      qrPayload: certificate.qrPayload,
      organization: certificate.inspection.organization,
    };
  }

  async pdf(number: string) {
    const certificate = await this.findByNumber(number, {
      sub: "public",
      phone: "",
      roles: ["super_admin"],
    });
    const buffer = await this.renderPdf(certificate);
    const objectKey = `certificates/${certificate.number}.pdf`;
    await this.storage.putObject({
      key: objectKey,
      body: buffer,
      contentType: "application/pdf",
    });
    await this.prisma.certificate.update({
      where: { id: certificate.id },
      data: { pdfObjectKey: objectKey },
    });
    return { buffer, filename: `${certificate.number}.pdf` };
  }

  async importXlsx(
    file: UploadedCertificateFile,
    user?: RequestUser,
    options?: {
      organizationBin?: string;
      ownerPhone?: string;
      mode?: string;
    },
  ) {
    if (!file?.buffer?.length)
      throw new BadRequestException("XLSX file is required");
    const originalName = this.decodeOriginalName(file.originalname);
    if (!originalName.toLowerCase().endsWith(".xlsx")) {
      throw new BadRequestException("Only .xlsx files are supported");
    }
    const fileHash = createHash("sha256").update(file.buffer).digest("hex");
    const existingJob = await this.prisma.certificateImportJob.findUnique({
      where: { fileHash_filename: { fileHash, filename: originalName } },
      include: {
        organization: true,
        certificate: {
          include: {
            vehicle: {
              include: { owners: { include: { user: true } }, cylinders: true },
            },
            inspection: { include: { organization: true } },
          },
        },
        errors: true,
      },
    });
    const inspectionDraftMode = options?.mode === "inspectionDraft";
    if (existingJob?.status === "completed" && !inspectionDraftMode) {
      return {
        ok: true,
        job: existingJob,
        certificate: existingJob.certificate,
      };
    }

    const parsedPreview = await this.tryParseCertificateXlsx(
      file.buffer,
      options,
    );
    const objectKey = `imports/certificates/${parsedPreview?.certificateNumber ?? fileHash}/${this.safeObjectName(originalName)}`;
    await this.storage.putObject({
      key: objectKey,
      body: file.buffer,
      contentType:
        file.mimetype ??
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      createdById: user?.sub,
    });
    const job =
      existingJob ??
      (await this.prisma.certificateImportJob.create({
        data: {
          filename: originalName,
          objectKey,
          fileHash,
          createdById: user?.sub,
          status: "processing",
        },
      }));

    try {
      const parsed =
        parsedPreview ?? (await this.parseCertificateXlsx(file.buffer, options));
      const organization = await this.resolveImportOrganization(
        parsed.organizationName,
        user,
        options?.organizationBin,
      );

      const ownerPhone =
        parsed.ownerPhone ||
        `owner:${parsed.certificateNumber || parsed.vin || fileHash}`;
      const ownerUser = await this.prisma.user.upsert({
        where: { phone: ownerPhone },
        update: {
          fullName: parsed.ownerName,
        },
        create: {
          phone: ownerPhone,
          fullName: parsed.ownerName,
          roles: { create: [{ role: "vehicle_owner" }] },
        },
      });

      await this.prisma.userRole.upsert({
        where: { userId_role: { userId: ownerUser.id, role: "vehicle_owner" } },
        update: {},
        create: { userId: ownerUser.id, role: "vehicle_owner" },
      });

      const vehicle = await this.prisma.vehicle.upsert({
        where: { vin: parsed.vin },
        update: {
          plateNumber: parsed.plateNumber,
          normalizedPlate: this.normalizeLookup(parsed.plateNumber),
          vinLast3: this.vehicleVinLast3(parsed.vin),
          make: parsed.make,
          model: parsed.model,
        },
        create: {
          vin: parsed.vin,
          plateNumber: parsed.plateNumber,
          normalizedPlate: this.normalizeLookup(parsed.plateNumber),
          vinLast3: this.vehicleVinLast3(parsed.vin),
          make: parsed.make,
          model: parsed.model,
        },
      });

      const existingOwner = await this.prisma.vehicleOwner.findFirst({
        where: { vehicleId: vehicle.id, userId: ownerUser.id },
      });
      if (existingOwner) {
        await this.prisma.vehicleOwner.update({
          where: { id: existingOwner.id },
          data: { fullName: parsed.ownerName, address: parsed.ownerAddress },
        });
      } else {
        await this.prisma.vehicleOwner.create({
          data: {
            vehicleId: vehicle.id,
            userId: ownerUser.id,
            fullName: parsed.ownerName,
            address: parsed.ownerAddress,
          },
        });
      }

      await this.assertCylinderUnique(
        parsed.cylinderSerial,
        parsed.cylinderManufacturer,
        vehicle.id,
      );

      const existingCylinder = await this.prisma.gasCylinder.findFirst({
        where: { vehicleId: vehicle.id, serialNumber: parsed.cylinderSerial },
      });
      if (existingCylinder) {
        await this.prisma.gasCylinder.update({
          where: { id: existingCylinder.id },
          data: {
            manufacturer: parsed.cylinderManufacturer,
            volumeLiters: parsed.volumeLiters,
            reducerName: parsed.reducerName,
            controlUnitName: parsed.controlUnitName,
            producedAt: parsed.producedAt,
            validUntil: parsed.validUntil,
          },
        });
      } else {
        await this.prisma.gasCylinder.create({
          data: {
            vehicleId: vehicle.id,
            serialNumber: parsed.cylinderSerial,
            manufacturer: parsed.cylinderManufacturer,
            volumeLiters: parsed.volumeLiters,
            reducerName: parsed.reducerName,
            controlUnitName: parsed.controlUnitName,
            producedAt: parsed.producedAt,
            validUntil: parsed.validUntil,
          },
        });
      }

      if (inspectionDraftMode) {
        const existingCertificate = await this.prisma.certificate.findUnique({
          where: { number: parsed.certificateNumber },
          include: {
            inspection: { include: this.importedInspectionInclude() },
          },
        });
        if (existingCertificate) {
          let inspection = existingCertificate.inspection;
          if (
            inspection &&
            inspection.organizationId !== organization.id &&
            (await this.canReassignImportedOrganization(
              inspection.organizationId,
              organization.name,
            ))
          ) {
            inspection = await this.prisma.inspection.update({
              where: { id: inspection.id },
              data: { organizationId: organization.id },
              include: this.importedInspectionInclude(),
            });
          }
          const completedJob = await this.prisma.certificateImportJob.update({
            where: { id: job.id },
            data: {
              status: "completed",
              organizationId: organization.id,
              certificateId: existingCertificate.id,
              createdCount: 0,
              updatedCount: 1,
              skippedCount: 0,
              errorCount: 0,
              finishedAt: new Date(),
              errors: { deleteMany: {} },
              summary: {
                mode: "inspectionDraft",
                reusedExistingCertificate: true,
                reportNumber: parsed.reportNumber,
                certificateNumber: parsed.certificateNumber,
                organizationName: organization.name,
                ownerName: parsed.ownerName,
                vin: parsed.vin,
                plateNumber: parsed.plateNumber,
              },
            },
            include: {
              organization: true,
              certificate: true,
              errors: true,
            },
          });
          return {
            ok: true,
            job: completedJob,
            certificate: existingCertificate,
            imported: parsed,
            inspection,
            originalFile: { objectKey },
          };
        }
        const existingDraft = await this.prisma.inspection.findUnique({
          where: { certificateNumber: parsed.certificateNumber },
        });
        const inspection = existingDraft
          ? await this.prisma.inspection.update({
              where: { id: existingDraft.id },
              data: {
                organizationId: organization.id,
                vehicleId: vehicle.id,
                status: "draft",
                inspectorName: parsed.inspectorName,
                notes: `Imported draft from ${originalName}. Report ${parsed.reportNumber}`,
                createdById: user?.sub,
              },
              include: this.importedInspectionInclude(),
            })
          : await this.prisma.inspection.create({
              data: {
                organizationId: organization.id,
                vehicleId: vehicle.id,
                certificateNumber: parsed.certificateNumber,
                status: "draft",
                inspectorName: parsed.inspectorName,
                notes: `Imported draft from ${originalName}. Report ${parsed.reportNumber}`,
                createdById: user?.sub,
              },
              include: this.importedInspectionInclude(),
            });
        const completedJob = await this.prisma.certificateImportJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            organizationId: organization.id,
            createdCount: existingDraft ? 0 : 1,
            updatedCount: existingDraft ? 1 : 0,
            skippedCount: 0,
            errorCount: 0,
            finishedAt: new Date(),
            errors: { deleteMany: {} },
            summary: {
              mode: "inspectionDraft",
              reportNumber: parsed.reportNumber,
              certificateNumber: parsed.certificateNumber,
              organizationName: organization.name,
              ownerName: parsed.ownerName,
              vin: parsed.vin,
              plateNumber: parsed.plateNumber,
            },
          },
          include: {
            organization: true,
            certificate: true,
            errors: true,
          },
        });
        await this.prisma.auditLog.create({
          data: {
            actorId: user?.sub,
            action: "inspection.import_xlsx_draft",
            entity: "Inspection",
            entityId: inspection.id,
            metadata: {
              filename: file.originalname,
              decodedFilename: originalName,
              objectKey,
              importJobId: job.id,
              reportNumber: parsed.reportNumber,
              vin: parsed.vin,
            },
          },
        });
        return {
          ok: true,
          job: completedJob,
          imported: parsed,
          inspection,
          originalFile: { objectKey },
        };
      }

      const existingCertificate = await this.prisma.certificate.findUnique({
        where: { number: parsed.certificateNumber },
        include: { inspection: true },
      });

      const inspection = existingCertificate
        ? await this.prisma.inspection.update({
            where: { id: existingCertificate.inspectionId },
            data: {
              organizationId: organization.id,
              vehicleId: vehicle.id,
              status: "approved",
              inspectorName: parsed.inspectorName,
              notes: `Imported from ${originalName}. Report ${parsed.reportNumber}`,
              submittedAt: parsed.issuedAt,
              approvedAt: parsed.issuedAt,
            },
          })
        : await this.prisma.inspection.create({
            data: {
              organizationId: organization.id,
              vehicleId: vehicle.id,
              status: "approved",
              inspectorName: parsed.inspectorName,
              notes: `Imported from ${originalName}. Report ${parsed.reportNumber}`,
              submittedAt: parsed.issuedAt,
              approvedAt: parsed.issuedAt,
            },
          });

      const certificate = await this.prisma.certificate.upsert({
        where: { number: parsed.certificateNumber },
        update: {
          vehicleId: vehicle.id,
          inspectionId: inspection.id,
          status: "active",
          validUntil: parsed.validUntil,
          issuedAt: parsed.issuedAt,
          qrPayload: `${parsed.certificateNumber}:${parsed.vin}`,
        },
        create: {
          number: parsed.certificateNumber,
          vehicleId: vehicle.id,
          inspectionId: inspection.id,
          status: "active",
          validUntil: parsed.validUntil,
          issuedAt: parsed.issuedAt,
          qrPayload: `${parsed.certificateNumber}:${parsed.vin}`,
        },
        include: {
          vehicle: {
            include: { owners: { include: { user: true } }, cylinders: true },
          },
          inspection: { include: { organization: true } },
        },
      });

      const completedJob = await this.prisma.certificateImportJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          organizationId: organization.id,
          certificateId: certificate.id,
          createdCount: existingCertificate ? 0 : 1,
          updatedCount: existingCertificate ? 1 : 0,
          skippedCount: 0,
          errorCount: 0,
          finishedAt: new Date(),
          errors: { deleteMany: {} },
          summary: {
            reportNumber: parsed.reportNumber,
            certificateNumber: parsed.certificateNumber,
            organizationName: organization.name,
            ownerName: parsed.ownerName,
            vin: parsed.vin,
            plateNumber: parsed.plateNumber,
            make: parsed.make,
            model: parsed.model,
            cylinderSerial: parsed.cylinderSerial,
            cylinderManufacturer: parsed.cylinderManufacturer,
            volumeLiters: parsed.volumeLiters,
            inspectorName: parsed.inspectorName,
            issuedAt: parsed.issuedAt,
            validUntil: parsed.validUntil,
          },
        },
        include: {
          organization: true,
          certificate: {
            include: {
              vehicle: {
                include: {
                  owners: { include: { user: true } },
                  cylinders: true,
                },
              },
              inspection: { include: { organization: true } },
            },
          },
          errors: true,
        },
      });

      await this.prisma.auditLog.create({
        data: {
          actorId: user?.sub,
          action: "certificate.import_xlsx",
          entity: "Certificate",
          entityId: certificate.id,
          metadata: {
            filename: file.originalname,
            decodedFilename: originalName,
            objectKey,
            importJobId: job.id,
            reportNumber: parsed.reportNumber,
            vin: parsed.vin,
          },
        },
      });

      return {
        ok: true,
        job: completedJob,
        imported: parsed,
        certificate,
        originalFile: { objectKey },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "XLSX import failed";
      await this.prisma.certificateImportJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          errorCount: 1,
          finishedAt: new Date(),
          errors: { create: this.importErrorRows(error, message) },
        },
      });
      if (error instanceof IncompleteCertificateXlsxError) {
        return {
          ok: false,
          status: "needs_input",
          job: {
            id: job.id,
            status: "needs_input",
            errorCount: error.missing.length,
          },
          message,
          missing: error.missing,
          partial: error.partial,
        };
      }
      throw error;
    }
  }

  private importErrorRows(error: unknown, message: string) {
    if (error instanceof IncompleteCertificateXlsxError) {
      return error.missing.map((field) => ({
        field,
        message,
        rawValue: this.xlsxFieldCells(field),
      }));
    }
    const response =
      typeof error === "object" &&
      error !== null &&
      "getResponse" in error &&
      typeof error.getResponse === "function"
        ? error.getResponse()
        : undefined;
    const missing =
      typeof response === "object" &&
      response !== null &&
      "missing" in response &&
      Array.isArray(response.missing)
        ? response.missing
        : [];
    if (!missing.length) return [{ message }];
    return missing.map((field: unknown) => ({
      field: String(field),
      message,
      rawValue: this.xlsxFieldCells(String(field)),
    }));
  }

  private xlsxFieldCells(field: string) {
    const cells: Record<string, string> = {
      reportNumber: "F6 / F44 / I98",
      certificateNumber: "F6 / F44 / I98",
      ownerName: "D94 / D10 / D130",
      vin: "E97 / H12 / E133",
      plateNumber: "I97 / J13 / I133",
      make: "F96 / H13 / F132",
      model: "I96 / I13 / I132",
      cylinderSerial: "F13 / E90 / E126",
    };
    return cells[field] ?? "empty";
  }

  private async nextNumber() {
    const year = new Date().getFullYear();
    const count = await this.prisma.certificate.count({
      where: {
        issuedAt: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
        },
      },
    });
    return `ERSI-${year}-${String(count + 1).padStart(6, "0")}`;
  }

  private async resolveImportOrganization(
    name: string,
    user?: RequestUser,
    organizationBin?: string,
  ) {
    if (user?.sub) {
      const membership = await this.prisma.organizationMember.findFirst({
        where: {
          userId: user.sub,
          role: { in: ["admin", "inspector", "inspection_org", "operator", "super_admin"] },
        },
        include: { organization: true },
        orderBy: { createdAt: "desc" },
      });
      if (membership?.organization) return membership.organization;
    }

    const bin = organizationBin?.trim() || this.importOrganizationBin(name);
    return this.prisma.organization.upsert({
      where: { bin },
      update: { name, type: "inspection_org" },
      create: {
        bin,
        name,
        type: "inspection_org",
      },
    });
  }

  private async parseCertificateXlsx(
    buffer: Buffer,
    options?: { ownerPhone?: string },
  ) {
    const sheet = await this.readFirstSheetCells(buffer);
    const cell = (address: string) => this.cleanCell(sheet.get(address));
    const dateCell = (address: string) => this.parseDate(sheet.get(address));

    const reportNumber = this.extractReportNumber(
      cell("F6") || cell("F44") || cell("I98"),
    );
    const issuedAt =
      dateCell("H6") ??
      dateCell("E102") ??
      dateCell("D138") ??
      dateCell("D8") ??
      dateCell("E9") ??
      new Date();
    const validUntil =
      this.parseMonthYear(cell("F101") || cell("F137")) ??
      this.plusYears(issuedAt, 2);
    const cylinderProducedAt = this.parseMonthYearStart(
      cell("H90") || cell("H126"),
    );

    const parsed = {
      reportNumber,
      certificateNumber: reportNumber,
      organizationName: this.normalizeOrganizationName(
        cell("G100") || cell("G136") || cell("D2"),
      ),
      ownerName: cell("D94") || cell("D10") || cell("D130"),
      ownerPhone: options?.ownerPhone?.trim() || "",
      ownerAddress: cell("E95") || cell("D11") || cell("E131"),
      vin: cell("E97") || cell("H12") || cell("E133"),
      plateNumber: cell("I97") || cell("J13") || cell("I133"),
      make: cell("F96") || cell("H13") || cell("F132"),
      model: cell("I96") || cell("I13") || cell("I132"),
      cylinderSerial: cell("F13") || cell("E90") || cell("E126"),
      cylinderManufacturer: cell("E91") || cell("E127") || "Не указан",
      volumeLiters: Number(cell("J90") || cell("J126") || cell("F14") || 0),
      reducerName: cell("F92") || cell("F128") || cell("D16") || undefined,
      controlUnitName:
        cell("F93") || cell("F129") || cell("D17") || undefined,
      producedAt: cylinderProducedAt,
      validUntil,
      issuedAt,
      inspectorName: cell("D38") || cell("E235") || cell("E193") || undefined,
    };

    const missing = Object.entries(parsed)
      .filter(
        ([key, value]) =>
          [
            "reportNumber",
            "certificateNumber",
            "ownerName",
            "ownerAddress",
            "vin",
            "plateNumber",
            "make",
            "model",
            "cylinderSerial",
            "cylinderManufacturer",
            "volumeLiters",
            "reducerName",
            "controlUnitName",
          ].includes(key) && !value,
      )
      .map(([key]) => key);
    if (missing.length) {
      throw new IncompleteCertificateXlsxError(missing, parsed);
    }
    return parsed;
  }

  private async tryParseCertificateXlsx(
    buffer: Buffer,
    options?: { ownerPhone?: string },
  ) {
    try {
      return await this.parseCertificateXlsx(buffer, options);
    } catch {
      return undefined;
    }
  }

  private async canReassignImportedOrganization(
    organizationId: string,
    nextOrganizationName: string,
  ) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { members: { select: { id: true }, take: 1 } },
    });
    if (!organization) return false;
    if (organization.members.length === 0) return true;
    if (organization.bin.startsWith("IMPORT-")) return true;
    return (
      this.normalizeLookup(organization.name) ===
      this.normalizeLookup(nextOrganizationName)
    );
  }

  private cleanCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "object") {
      const objectValue = value as {
        text?: string;
        result?: unknown;
        richText?: Array<{ text?: string }>;
        hyperlink?: string;
      };
      if (objectValue.result !== undefined)
        return this.cleanCell(objectValue.result);
      if (objectValue.text) return objectValue.text.replace(/\s+/g, " ").trim();
      if (objectValue.richText?.length) {
        return objectValue.richText
          .map((item) => item.text ?? "")
          .join("")
          .replace(/\s+/g, " ")
          .trim();
      }
      if (objectValue.hyperlink) return objectValue.hyperlink.trim();
    }
    return String(value).replace(/\s+/g, " ").trim();
  }

  private async readFirstSheetCells(buffer: Buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
    });
    const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
    const relsXml = await zip
      .file("xl/_rels/workbook.xml.rels")
      ?.async("string");
    if (!workbookXml || !relsXml)
      throw new BadRequestException("Invalid XLSX workbook");

    const workbook = parser.parse(workbookXml) as Record<string, unknown>;
    const rels = parser.parse(relsXml) as Record<string, unknown>;
    const firstSheet = this.asArray(
      this.path(workbook, ["workbook", "sheets", "sheet"]),
    )[0] as Record<string, unknown> | undefined;
    const relationId = firstSheet?.["@_r:id"]?.toString();
    const relation = this.asArray(
      this.path(rels, ["Relationships", "Relationship"]),
    ).find(
      (item) => (item as Record<string, unknown>)["@_Id"] === relationId,
    ) as Record<string, unknown> | undefined;
    const target =
      relation?.["@_Target"]?.toString() ?? "worksheets/sheet1.xml";
    const sheetPath = `xl/${target.replace(/^\/?xl\//, "")}`;
    const sheetXml = await zip.file(sheetPath)?.async("string");
    if (!sheetXml) throw new BadRequestException("XLSX has no sheets");

    const sharedStrings = await this.readSharedStrings(zip, parser);
    const sheet = parser.parse(sheetXml) as Record<string, unknown>;
    const cells = new Map<string, string>();
    for (const row of this.asArray(
      this.path(sheet, ["worksheet", "sheetData", "row"]),
    )) {
      for (const item of this.asArray((row as Record<string, unknown>).c)) {
        const cell = item as Record<string, unknown>;
        const address = cell["@_r"]?.toString();
        if (!address) continue;
        const type = cell["@_t"]?.toString();
        const raw = this.cellText(cell);
        if (type === "s") {
          cells.set(address, sharedStrings[Number(raw)] ?? "");
        } else if (type === "inlineStr") {
          cells.set(address, this.inlineString(cell.is));
        } else {
          cells.set(address, raw);
        }
      }
    }
    return cells;
  }

  private async readSharedStrings(zip: JSZip, parser: XMLParser) {
    const xml = await zip.file("xl/sharedStrings.xml")?.async("string");
    if (!xml) return [];
    const parsed = parser.parse(xml) as Record<string, unknown>;
    return this.asArray(this.path(parsed, ["sst", "si"])).map((item) =>
      this.inlineString(item),
    );
  }

  private cellText(cell: Record<string, unknown>) {
    const value = cell.v;
    if (value === null || value === undefined) return "";
    return typeof value === "object"
      ? this.cleanCell((value as Record<string, unknown>)["#text"])
      : this.cleanCell(value);
  }

  private inlineString(value: unknown): string {
    const item = value as Record<string, unknown> | undefined;
    if (!item) return "";
    if (item.t !== undefined)
      return this.cleanCell(
        typeof item.t === "object"
          ? (item.t as Record<string, unknown>)["#text"]
          : item.t,
      );
    return this.asArray(item.r)
      .map((part) => this.inlineString(part))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  }

  private path(source: Record<string, unknown>, keys: string[]) {
    return keys.reduce<unknown>(
      (value, key) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
      source,
    );
  }

  private asArray(value: unknown): unknown[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
  }

  private parseDate(value: unknown) {
    if (value instanceof Date) return value;
    const text = this.cleanCell(value);
    if (!text) return undefined;
    if (/^\d+(\.\d+)?$/.test(text)) {
      const serial = Number(text);
      if (serial > 20_000 && serial < 80_000)
        return this.excelSerialDate(serial);
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private excelSerialDate(serial: number) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + Math.round(serial) * 86_400_000);
  }

  private parseMonthYear(value: string) {
    const match = value.match(/(\d{1,2})[./-](\d{4})/);
    if (!match) return undefined;
    const month = Number(match[1]);
    const year = Number(match[2]);
    return new Date(Date.UTC(year, month, 0, 23, 59, 59));
  }

  private parseMonthYearStart(value: string) {
    const match = value.match(/(\d{1,2})[./-](\d{4})/);
    if (!match) return undefined;
    return new Date(Date.UTC(Number(match[2]), Number(match[1]) - 1, 1));
  }

  private plusYears(date: Date, years: number) {
    const copy = new Date(date);
    copy.setFullYear(copy.getFullYear() + years);
    return copy;
  }

  private extractEaeuNumber(value: string) {
    const match = value.match(/KZ\d+/i);
    return match
      ? `ЕАЭС-${match[0].toUpperCase()}`
      : `ЕАЭС-KZ-${new Date().getFullYear()}`;
  }

  private extractReportNumber(value: string) {
    const clean = value.trim();
    const match = clean.match(/\d+/);
    return match?.[0] ?? clean;
  }

  private async assertCylinderUnique(
    serialNumber: string,
    manufacturer: string,
    vehicleId: string,
  ) {
    const serial = serialNumber.trim();
    const maker = manufacturer.trim();
    if (!serial || !maker) return;
    const duplicate = await this.prisma.gasCylinder.findFirst({
      where: {
        serialNumber: { equals: serial, mode: "insensitive" },
        manufacturer: { equals: maker, mode: "insensitive" },
        vehicleId: { not: vehicleId },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(
        "Баллон с таким номером и производителем уже есть в системе. Обратитесь к администратору",
      );
    }
  }

  private normalizeOrganizationName(value: string) {
    return (
      value
        .replace(/[«»"]/g, "")
        .replace(/\bТОО\b/gi, "ТОО")
        .trim() || "Импортированный инспекционный орган"
    );
  }

  private importOrganizationBin(name: string) {
    const slug = name
      .toUpperCase()
      .replace(/[^A-ZА-Я0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    return `IMPORT-${slug || "ORG"}`;
  }

  private importOwnerPhone(reportNumber: string) {
    const digits = reportNumber.replace(/\D/g, "").slice(-10).padStart(10, "0");
    return `+7${digits}`;
  }

  private decodeOriginalName(name: string) {
    const decoded = Buffer.from(name, "latin1").toString("utf8");
    return decoded.includes("�") ? name : decoded;
  }

  private safeObjectName(name: string) {
    return name.replace(/[\\/]/g, "-").replace(/\s+/g, " ").trim();
  }

  private renderPdf(
    certificate: Awaited<ReturnType<CertificatesService["findByNumber"]>>,
  ) {
    return new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: "A4", margin: 48 });
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));

      const fontPath = this.fontPath();
      if (fontPath) doc.font(fontPath);

      const owner = certificate.vehicle.owners[0];
      const cylinder = certificate.vehicle.cylinders[0];
      doc
        .fontSize(20)
        .fillColor("#003C2B")
        .text("ЕРСИ ГБО", { align: "center" })
        .moveDown(0.5)
        .fontSize(15)
        .text("Свидетельство о регистрации ГБО", { align: "center" })
        .moveDown(1.5);

      doc.fontSize(11).fillColor("#173A30");
      this.row(doc, "Номер", certificate.number);
      this.row(doc, "Статус", certificate.status);
      this.row(doc, "VIN", certificate.vehicle.vin);
      this.row(doc, "Госномер", certificate.vehicle.plateNumber);
      this.row(
        doc,
        "ТС",
        `${certificate.vehicle.make} ${certificate.vehicle.model}`,
      );
      this.row(doc, "Владелец", owner?.fullName ?? "-");
      this.row(doc, "ИИН", owner?.iin ?? "-");
      this.row(doc, "Баллон", cylinder?.serialNumber ?? "-");
      this.row(
        doc,
        "Инспекционный орган",
        certificate.inspection.organization.name,
      );
      const organization = certificate.inspection.organization;
      const accreditationDate = (date: Date | null) => date ? date.toISOString().slice(0, 10).split("-").reverse().join(".") : "не указан";
      this.row(doc, "Аттестат аккредитации", `от ${accreditationDate(organization.accreditationValidFrom)} до ${accreditationDate(organization.accreditationValidUntil)}`);
      this.row(doc, "Выдано", certificate.issuedAt.toISOString().slice(0, 10));
      this.row(
        doc,
        "Действует до",
        certificate.validUntil.toISOString().slice(0, 10),
      );

      doc.moveDown(1.2);
      doc
        .roundedRect(doc.x, doc.y, 500, 82, 8)
        .strokeColor("#DDEBE5")
        .stroke()
        .fillColor("#173A30")
        .fontSize(10)
        .text("QR payload для проверки:", doc.x + 14, doc.y + 14)
        .moveDown(0.5)
        .fontSize(12)
        .text(certificate.qrPayload);

      doc
        .moveDown(3)
        .fontSize(9)
        .fillColor("#7F918A")
        .text(
          "Документ сформирован автоматически информационной системой ЕРСИ ГБО.",
          {
            align: "center",
          },
        );
      doc.end();
    });
  }

  private row(doc: PDFKit.PDFDocument, label: string, value: string) {
    doc
      .fillColor("#7F918A")
      .text(label, { continued: true, width: 160 })
      .fillColor("#173A30")
      .text(`  ${value}`);
    doc.moveDown(0.35);
  }

  private fontPath() {
    const candidates = [
      "/Library/Fonts/Arial Unicode.ttf",
      "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ];
    return candidates.find((path) => existsSync(path));
  }
}
