import { prisma } from "@/libs/prismaClient";
import { IServicePackageRepository } from "../../repositories/IServicePackageRepository";
import {
  ICreateServicePackageDTO,
  IUpdateServicePackageDTO,
  IServicePackageResponseDTO,
} from "../../dtos/IPackageDTO";

const include = {
  service: { select: { name: true, price: true } },
} as const;

function map(record: {
  id: string;
  barbershopId: string;
  serviceId: string;
  name: string;
  sessionCount: number;
  price: number;
  validityDays: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  service?: { name: string; price: number } | null;
}): IServicePackageResponseDTO {
  return {
    id: record.id,
    barbershopId: record.barbershopId,
    serviceId: record.serviceId,
    serviceName: record.service?.name ?? null,
    servicePrice: record.service?.price ?? null,
    name: record.name,
    sessionCount: record.sessionCount,
    price: record.price,
    validityDays: record.validityDays,
    active: record.active,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class ServicePackageRepository implements IServicePackageRepository {
  async create(data: ICreateServicePackageDTO): Promise<IServicePackageResponseDTO> {
    const record = await prisma.servicePackage.create({
      data: {
        barbershopId: data.barbershopId,
        serviceId: data.serviceId,
        name: data.name,
        sessionCount: data.sessionCount,
        price: data.price,
        validityDays: data.validityDays ?? null,
      },
      include,
    });
    return map(record);
  }

  async findById(id: string): Promise<IServicePackageResponseDTO | null> {
    const record = await prisma.servicePackage.findUnique({
      where: { id },
      include,
    });
    return record ? map(record) : null;
  }

  async list(
    barbershopId: string,
    activeOnly?: boolean
  ): Promise<IServicePackageResponseDTO[]> {
    const records = await prisma.servicePackage.findMany({
      where: {
        barbershopId,
        ...(activeOnly ? { active: true } : {}),
      },
      orderBy: { name: "asc" },
      include,
    });
    return records.map(map);
  }

  async update(
    id: string,
    data: IUpdateServicePackageDTO
  ): Promise<IServicePackageResponseDTO> {
    const record = await prisma.servicePackage.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.serviceId !== undefined && { serviceId: data.serviceId }),
        ...(data.sessionCount !== undefined && { sessionCount: data.sessionCount }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.validityDays !== undefined && { validityDays: data.validityDays }),
        ...(data.active !== undefined && { active: data.active }),
      },
      include,
    });
    return map(record);
  }
}
