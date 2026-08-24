import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IClientPackageRepository, ICreateClientPackageRecord } from "../../repositories/IClientPackageRepository";
import {
  IClientPackageResponseDTO,
  IPackageSalesSummary,
  ClientPackageStatus,
} from "../../dtos/IPackageDTO";

const include = {
  client: { select: { name: true, whatsapp: true } },
  package: { select: { name: true } },
  service: { select: { name: true, avgTimeMinutes: true } },
} as const;

function map(record: {
  id: string;
  barbershopId: string;
  clientId: string;
  packageId: string;
  serviceId: string;
  totalSessions: number;
  remainingSessions: number;
  pricePaid: number;
  paymentMethod: IClientPackageResponseDTO["paymentMethod"];
  status: ClientPackageStatus;
  purchasedAt: Date;
  expiresAt: Date | null;
  soldById: string | null;
  createdAt: Date;
  updatedAt: Date;
  client?: { name: string; whatsapp: string } | null;
  package?: { name: string } | null;
  service?: { name: string; avgTimeMinutes: number } | null;
}): IClientPackageResponseDTO {
  return {
    id: record.id,
    barbershopId: record.barbershopId,
    clientId: record.clientId,
    clientName: record.client?.name ?? null,
    clientWhatsapp: record.client?.whatsapp ?? null,
    packageId: record.packageId,
    packageName: record.package?.name ?? null,
    serviceId: record.serviceId,
    serviceName: record.service?.name ?? null,
    serviceDurationMinutes: record.service?.avgTimeMinutes ?? null,
    totalSessions: record.totalSessions,
    remainingSessions: record.remainingSessions,
    pricePaid: record.pricePaid,
    paymentMethod: record.paymentMethod,
    status: record.status,
    purchasedAt: record.purchasedAt,
    expiresAt: record.expiresAt,
    soldById: record.soldById,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class ClientPackageRepository implements IClientPackageRepository {
  async create(data: ICreateClientPackageRecord): Promise<IClientPackageResponseDTO> {
    const record = await prisma.clientPackage.create({
      data: {
        barbershopId: data.barbershopId,
        clientId: data.clientId,
        packageId: data.packageId,
        serviceId: data.serviceId,
        totalSessions: data.totalSessions,
        remainingSessions: data.remainingSessions,
        pricePaid: data.pricePaid,
        paymentMethod: data.paymentMethod,
        expiresAt: data.expiresAt ?? null,
        soldById: data.soldById ?? null,
      },
      include,
    });
    return map(record);
  }

  async findById(id: string): Promise<IClientPackageResponseDTO | null> {
    const record = await prisma.clientPackage.findUnique({
      where: { id },
      include,
    });
    return record ? map(record) : null;
  }

  async list(params: {
    barbershopId: string;
    clientId?: string;
    status?: ClientPackageStatus;
  }): Promise<IClientPackageResponseDTO[]> {
    const records = await prisma.clientPackage.findMany({
      where: {
        barbershopId: params.barbershopId,
        ...(params.clientId ? { clientId: params.clientId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      orderBy: { purchasedAt: "desc" },
      include,
    });
    return records.map(map);
  }

  async debitSessions(id: string, count: number): Promise<IClientPackageResponseDTO> {
    const result = await prisma.clientPackage.updateMany({
      where: {
        id,
        status: "ACTIVE",
        remainingSessions: { gte: count },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: { remainingSessions: { decrement: count } },
    });
    if (result.count !== 1) {
      throw new AppError("Saldo insuficiente ou pacote indisponível", 400);
    }

    await prisma.clientPackage.updateMany({
      where: { id, remainingSessions: 0, status: "ACTIVE" },
      data: { status: "DEPLETED" },
    });

    const updated = await this.findById(id);
    if (!updated) throw new AppError("Pacote do cliente não encontrado", 404);
    return updated;
  }

  async restoreSessions(id: string, count: number): Promise<IClientPackageResponseDTO> {
    const pkg = await prisma.clientPackage.findUnique({ where: { id } });
    if (!pkg) throw new AppError("Pacote do cliente não encontrado", 404);
    if (pkg.status !== "ACTIVE" && pkg.status !== "DEPLETED") {
      const current = await this.findById(id);
      return current!;
    }

    const remaining = pkg.remainingSessions + count;
    await prisma.clientPackage.update({
      where: { id },
      data: {
        remainingSessions: remaining,
        status: remaining > 0 ? "ACTIVE" : "DEPLETED",
      },
    });

    const updated = await this.findById(id);
    if (!updated) throw new AppError("Pacote do cliente não encontrado", 404);
    return updated;
  }

  async cancel(id: string): Promise<IClientPackageResponseDTO> {
    const record = await prisma.clientPackage.update({
      where: { id },
      data: { status: "CANCELLED" },
      include,
    });
    return map(record);
  }

  async getSalesSummary(
    barbershopId: string,
    from?: Date,
    to?: Date
  ): Promise<IPackageSalesSummary> {
    const where = {
      barbershopId,
      status: { in: ["ACTIVE", "DEPLETED"] as ClientPackageStatus[] },
      ...(from || to
        ? {
            purchasedAt: {
              ...(from && { gte: from }),
              ...(to && { lte: to }),
            },
          }
        : {}),
    };

    const agg = await prisma.clientPackage.aggregate({
      where,
      _count: { id: true },
      _sum: { pricePaid: true },
    });

    return {
      count: agg._count.id,
      totalPaid: agg._sum.pricePaid ?? 0,
    };
  }
}
