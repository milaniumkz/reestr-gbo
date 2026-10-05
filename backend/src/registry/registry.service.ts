import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { hasGlobalAccess, userOrganizationIds } from "../common/access-scope";
import { RequestUser } from "../common/current-user";
import { listResponse, paginationMeta } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    user: RequestUser | undefined,
    query: string,
    limit?: string,
    page?: string,
    filters: {
      status?: string;
      organizationId?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) {
    const normalized = query.trim();
    const meta = paginationMeta(page, limit ?? "20");
    const organizationIds = hasGlobalAccess(user)
      ? undefined
      : await userOrganizationIds(this.prisma, user);
    const requestedOrganizationId = filters.organizationId?.trim();
    const scopedOrganizationIds =
      requestedOrganizationId && requestedOrganizationId !== "all"
        ? organizationIds?.includes(requestedOrganizationId) || hasGlobalAccess(user)
          ? [requestedOrganizationId]
          : []
        : organizationIds;
    const certificateFilter: Prisma.CertificateWhereInput = {
      ...(filters.status?.trim() && filters.status !== "all"
        ? { status: filters.status.trim() }
        : {}),
      ...(scopedOrganizationIds
        ? { inspection: { organizationId: { in: scopedOrganizationIds } } }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
          issuedAt: {
              ...(this.filterDate(filters.dateFrom)
                ? { gte: this.filterDate(filters.dateFrom) }
                : {}),
              ...(this.filterDate(filters.dateTo, true)
                ? { lte: this.filterDate(filters.dateTo, true) }
                : {}),
            },
          }
        : {}),
    };
    const hasCertificateFilter = Object.keys(certificateFilter).length > 0;
    const where: Prisma.VehicleWhereInput = normalized
        ? {
            OR: [
              { vin: { contains: normalized, mode: "insensitive" } },
              { plateNumber: { contains: normalized, mode: "insensitive" } },
              { owners: { some: { iin: { contains: normalized } } } },
              {
                owners: {
                  some: {
                    fullName: { contains: normalized, mode: "insensitive" },
                  },
                },
              },
              {
                certificates: {
                  some: {
                    number: { contains: normalized, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {};
    if (hasCertificateFilter) {
      where.certificates = { some: certificateFilter };
    }
    if (!hasGlobalAccess(user)) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            ...(organizationIds
              ? [{ certificates: { some: { inspection: { organizationId: { in: organizationIds } } } } }]
              : []),
            ...(user?.roles.includes("vehicle_owner")
              ? [{ owners: { some: { userId: user.sub } } }]
              : []),
          ],
        },
      ];
    }
    const [vehicles, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        include: {
          owners: { include: { user: true } },
          cylinders: true,
          certificates: {
            ...(hasCertificateFilter ? { where: certificateFilter } : {}),
            orderBy: { issuedAt: "desc" },
            take: 1,
            include: {
              inspection: {
                include: { organization: true, photos: true },
              },
            },
          },
        },
        skip: meta.skip,
        take: meta.limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return listResponse(vehicles, total, page, limit ?? "20");
  }

  async publicCertificateChecks(
    query: string,
    found?: string,
    limit?: string,
    filters: {
      plate?: string;
      certificateNumber?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
    page?: string,
  ) {
    const normalized = query.trim();
    const plate = filters.plate?.replace(/[^0-9a-zA-Zа-яА-Я]/g, "").toUpperCase();
    const meta = paginationMeta(page, limit ?? "200");
    const foundFilter =
      found === "true" ? true : found === "false" ? false : undefined;
    const where: Prisma.PublicCertificateCheckWhereInput = {
        ...(foundFilter === undefined ? {} : { found: foundFilter }),
        ...(plate ? { normalizedPlate: { contains: plate, mode: "insensitive" as const } } : {}),
        ...(filters.certificateNumber
          ? {
              certificateNumber: {
                contains: filters.certificateNumber,
                mode: "insensitive" as const,
              },
            }
          : {}),
        ...(filters.dateFrom || filters.dateTo
          ? {
              createdAt: {
                ...(this.filterDate(filters.dateFrom)
                  ? { gte: this.filterDate(filters.dateFrom) }
                  : {}),
                ...(this.filterDate(filters.dateTo, true)
                  ? { lte: this.filterDate(filters.dateTo, true) }
                  : {}),
              },
            }
          : {}),
        ...(normalized
          ? {
              OR: [
                { plateNumber: { contains: normalized, mode: "insensitive" } },
                {
                  normalizedPlate: {
                    contains: normalized.toUpperCase(),
                    mode: "insensitive",
                  },
                },
                {
                  vinLast3: {
                    contains: normalized.toUpperCase(),
                    mode: "insensitive",
                  },
                },
                {
                  certificateNumber: {
                    contains: normalized,
                    mode: "insensitive",
                  },
                },
                { address: { contains: normalized, mode: "insensitive" } },
                { ipAddress: { contains: normalized, mode: "insensitive" } },
                { userAgent: { contains: normalized, mode: "insensitive" } },
              ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.publicCertificateCheck.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: meta.skip,
        take: meta.limit,
      }),
      this.prisma.publicCertificateCheck.count({ where }),
    ]);
    return listResponse(items, total, page, limit ?? "200");
  }

  async publicCertificateCheck(
    plateNumber: string,
    vinLast3: string,
    meta: {
      lat?: string;
      lng?: string;
      ipAddress?: string;
      userAgent?: string;
    } = {},
  ) {
    const plate = plateNumber.replace(/[^0-9a-zA-Zа-яА-Я]/g, "").toUpperCase();
    const vin3 = vinLast3.trim().toUpperCase();
    if (!plate || !/^[a-zA-Z0-9]{3}$/.test(vin3)) {
      await this.savePublicCheck(
        plateNumber,
        plate,
        vin3,
        false,
        undefined,
        meta,
      );
      return { found: false, item: null };
    }
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        normalizedPlate: plate,
        vinLast3: vin3,
      },
      include: {
        owners: { include: { user: true } },
        cylinders: true,
        certificates: {
          orderBy: { issuedAt: "desc" },
          take: 1,
          include: {
            inspection: {
              include: { organization: true, photos: true },
            },
          },
        },
      },
    });
    if (!vehicle || vehicle.certificates.length === 0) {
      await this.savePublicCheck(
        plateNumber,
        plate,
        vin3,
        false,
        undefined,
        meta,
      );
      return { found: false, item: null };
    }
    await this.savePublicCheck(plateNumber, plate, vin3, true, vehicle, meta);
    return { found: true, item: vehicle };
  }

  private async savePublicCheck(
    plateNumber: string,
    normalizedPlate: string,
    vinLast3: string,
    found: boolean,
    vehicle:
      | {
          id: string;
          certificates: Array<{ id: string; number: string }>;
        }
      | undefined,
    meta: {
      lat?: string;
      lng?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ) {
    const lat = this.coordinate(meta.lat, -90, 90);
    const lng = this.coordinate(meta.lng, -180, 180);
    const certificate = vehicle?.certificates[0];
    const check = await this.prisma.publicCertificateCheck.create({
      data: {
        plateNumber: plateNumber.trim(),
        normalizedPlate,
        vinLast3,
        found,
        vehicleId: vehicle?.id,
        certificateId: certificate?.id,
        certificateNumber: certificate?.number,
        lat,
        lng,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });
    if (lat !== undefined && lng !== undefined) {
      void this.fillPublicCheckAddress(check.id, lat, lng);
    }
  }

  private async fillPublicCheckAddress(id: string, lat: number, lng: number) {
    const address = await this.reverseGeocode(lat, lng);
    if (!address) return;
    await this.prisma.publicCertificateCheck
      .update({ where: { id }, data: { address } })
      .catch(() => undefined);
  }

  private coordinate(value: string | undefined, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max)
      return undefined;
    return parsed;
  }

  private filterDate(value?: string, endOfDay = false) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    if (endOfDay) date.setHours(23, 59, 59, 999);
    else date.setHours(0, 0, 0, 0);
    return date;
  }

  private async reverseGeocode(lat: number, lng: number) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          signal: controller.signal,
          headers: {
            "User-Agent": "ERSI-GBO/1.0 registry-check logging",
            "Accept-Language": "ru,kk,en",
          },
        },
      );
      clearTimeout(timeout);
      if (!response.ok) return undefined;
      const data = (await response.json()) as { display_name?: string };
      return data.display_name?.slice(0, 500);
    } catch {
      return undefined;
    }
  }
}
