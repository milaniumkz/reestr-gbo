import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { RequestUser } from "../common/current-user";
import { listResponse, paginationMeta } from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q?: string, page?: string, limit?: string) {
    const query = q?.trim();
    const where: Prisma.VehicleWhereInput | undefined = query
        ? {
            OR: [
              { vin: { contains: query, mode: "insensitive" as const } },
              { plateNumber: { contains: query, mode: "insensitive" as const } },
              { make: { contains: query, mode: "insensitive" as const } },
              { model: { contains: query, mode: "insensitive" as const } },
              {
                owners: {
                  some: { fullName: { contains: query, mode: "insensitive" as const } },
                },
              },
              { owners: { some: { iin: { contains: query } } } },
            ],
          }
        : undefined;
    const meta = paginationMeta(page, limit);
    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        include: { owners: true, cylinders: true, certificates: true },
        orderBy: { createdAt: "desc" },
        skip: meta.skip,
        take: meta.limit,
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return listResponse(items, total, page, limit);
  }

  find(id: string) {
    return this.prisma.vehicle.findUniqueOrThrow({
      where: { id },
      include: {
        owners: true,
        cylinders: true,
        certificates: true,
        inspections: true,
      },
    });
  }

  async create(input: {
    vin: string;
    plateNumber: string;
    make: string;
    model: string;
    year?: number;
    owner: { phone: string; fullName: string; iin?: string; address?: string };
    cylinder: {
      serialNumber: string;
      manufacturer: string;
      volumeLiters: number;
      reducerName?: string;
      controlUnitName?: string;
      producedAt?: string;
      validUntil: string;
    };
  }, user?: RequestUser) {
    const ownerUser = await this.prisma.user.upsert({
      where: { phone: input.owner.phone },
      update: {
        fullName: input.owner.fullName,
        iin: input.owner.iin,
      },
      create: {
        phone: input.owner.phone,
        fullName: input.owner.fullName,
        iin: input.owner.iin,
        roles: { create: [{ role: "vehicle_owner" }] },
      },
    });

    return this.prisma.vehicle
      .upsert({
        where: { vin: input.vin },
        update: {
          plateNumber: input.plateNumber,
          normalizedPlate: this.normalizedPlate(input.plateNumber),
          vinLast3: this.vinLast3(input.vin),
          make: input.make,
          model: input.model,
          year: input.year,
        },
        create: {
          vin: input.vin,
          plateNumber: input.plateNumber,
          normalizedPlate: this.normalizedPlate(input.plateNumber),
          vinLast3: this.vinLast3(input.vin),
          make: input.make,
          model: input.model,
          year: input.year,
        },
      })
      .then(async (vehicle) => {
        await this.assertCylinderUnique(
          input.cylinder.serialNumber,
          input.cylinder.manufacturer,
          vehicle.id,
        );

        const existingOwner = await this.prisma.vehicleOwner.findFirst({
          where: { vehicleId: vehicle.id, userId: ownerUser.id },
        });
        if (existingOwner) {
          await this.prisma.vehicleOwner.update({
            where: { id: existingOwner.id },
            data: {
              fullName: input.owner.fullName,
              iin: input.owner.iin,
              address: input.owner.address,
            },
          });
        } else {
          await this.prisma.vehicleOwner.create({
            data: {
              vehicleId: vehicle.id,
              userId: ownerUser.id,
              fullName: input.owner.fullName,
              iin: input.owner.iin,
              address: input.owner.address,
            },
          });
        }

        const existingCylinder = await this.prisma.gasCylinder.findFirst({
          where: {
            vehicleId: vehicle.id,
            serialNumber: input.cylinder.serialNumber,
          },
        });
        if (!existingCylinder) {
          await this.prisma.gasCylinder.create({
            data: {
              vehicleId: vehicle.id,
              serialNumber: input.cylinder.serialNumber,
              manufacturer: input.cylinder.manufacturer,
              volumeLiters: input.cylinder.volumeLiters,
              reducerName: input.cylinder.reducerName,
              controlUnitName: input.cylinder.controlUnitName,
              producedAt: input.cylinder.producedAt
                ? new Date(input.cylinder.producedAt)
                : undefined,
              validUntil: new Date(input.cylinder.validUntil),
            },
          });
        } else {
          await this.prisma.gasCylinder.update({
            where: { id: existingCylinder.id },
            data: {
              manufacturer: input.cylinder.manufacturer,
              volumeLiters: input.cylinder.volumeLiters,
              reducerName: input.cylinder.reducerName,
              controlUnitName: input.cylinder.controlUnitName,
              producedAt: input.cylinder.producedAt
                ? new Date(input.cylinder.producedAt)
                : undefined,
              validUntil: new Date(input.cylinder.validUntil),
            },
          });
        }

        await this.prisma.auditLog.create({
          data: {
            actorId: user?.sub,
            action: "vehicle.upsert",
            entity: "vehicle",
            entityId: vehicle.id,
            metadata: {
              vin: vehicle.vin,
              plateNumber: vehicle.plateNumber,
              ownerUserId: ownerUser.id,
              cylinderSerial: input.cylinder.serialNumber,
            },
          },
        });
        return this.find(vehicle.id);
      });
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

  private normalizedPlate(value: string) {
    return value.replace(/[^0-9a-zA-Zа-яА-Я]/g, "").toUpperCase();
  }

  private vinLast3(value: string) {
    return value.trim().toUpperCase().slice(-3);
  }
}
