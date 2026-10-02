import { Prisma } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";
import { ICommissionRepository } from "../../repositories/ICommissionRepository";
import {
  ICommissionEntryDTO,
  ICommissionSummary,
  IListCommissionsQuery,
} from "../../dtos/ICommissionDTO";
import { commissionAmount } from "@/modules/financial/ledger/commissionMath";

const include = {
  service: { select: { name: true, price: true } },
  professional: { select: { name: true } },
  queueItem: { select: { finalPrice: true } },
  appointment: { select: { finalPrice: true } },
} as const;

type CommissionWithRelations = Prisma.CommissionEntryGetPayload<{
  include: typeof include;
}>;

function mapEntry(entry: CommissionWithRelations): ICommissionEntryDTO {
  return {
    id: entry.id,
    barbershopId: entry.barbershopId,
    queueItemId: entry.queueItemId,
    appointmentId: entry.appointmentId,
    origin: entry.appointmentId ? "APPOINTMENT" : "QUEUE",
    serviceId: entry.serviceId,
    serviceName: entry.service.name,
    professionalId: entry.professionalId,
    professionalName: entry.professional.name,
    percentage: entry.percentage,
    amount: entry.amount,
    createdAt: entry.createdAt,
  };
}

function dateFilter(query: { from?: string; to?: string }): Prisma.DateTimeFilter | undefined {
  if (!query.from && !query.to) return undefined;
  return {
    ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
    ...(query.to ? { lt: new Date(`${query.to}T00:00:00.000Z`) } : {}),
  };
}

export class CommissionRepository implements ICommissionRepository {
  async hasEntriesForQueueItem(queueItemId: string): Promise<boolean> {
    const count = await prisma.commissionEntry.count({ where: { queueItemId } });
    return count > 0;
  }

  async createForQueueItem(data: {
    barbershopId: string;
    queueItemId: string;
    serviceId: string;
    finalPrice: number;
    splits: Array<{ professionalId: string; percentage: number }>;
  }): Promise<void> {
    await prisma.commissionEntry.createMany({
      data: data.splits.map((split) => ({
        barbershopId: data.barbershopId,
        queueItemId: data.queueItemId,
        serviceId: data.serviceId,
        professionalId: split.professionalId,
        percentage: split.percentage,
        amount: commissionAmount(data.finalPrice, split.percentage),
      })),
      skipDuplicates: true,
    });
  }

  async list(barbershopId: string, query: IListCommissionsQuery) {
    const where: Prisma.CommissionEntryWhereInput = {
      barbershopId,
      ...(query.professionalId ? { professionalId: query.professionalId } : {}),
      ...(query.origin === "QUEUE" ? { queueItemId: { not: null } } : {}),
      ...(query.origin === "APPOINTMENT" ? { appointmentId: { not: null } } : {}),
      ...(dateFilter(query) ? { createdAt: dateFilter(query) } : {}),
    };
    const [records, total] = await Promise.all([
      prisma.commissionEntry.findMany({
        where,
        include,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.commissionEntry.count({ where }),
    ]);
    return { data: records.map(mapEntry), total };
  }

  async summary(
    barbershopId: string,
    query: Omit<IListCommissionsQuery, "page" | "limit">,
  ): Promise<ICommissionSummary> {
    const where: Prisma.CommissionEntryWhereInput = {
      barbershopId,
      ...(query.professionalId ? { professionalId: query.professionalId } : {}),
      ...(query.origin === "QUEUE" ? { queueItemId: { not: null } } : {}),
      ...(query.origin === "APPOINTMENT" ? { appointmentId: { not: null } } : {}),
      ...(dateFilter(query) ? { createdAt: dateFilter(query) } : {}),
    };
    const entries = await prisma.commissionEntry.findMany({ where, include });
    const byProfessional = new Map<string, ICommissionSummary["byProfessional"][number]>();
    for (const entry of entries) {
      const current = byProfessional.get(entry.professionalId) ?? {
        professionalId: entry.professionalId,
        professionalName: entry.professional.name,
        commissionTotal: 0,
        entryCount: 0,
      };
      current.commissionTotal += entry.amount;
      current.entryCount += 1;
      byProfessional.set(entry.professionalId, current);
    }
    const commissionTotal = entries.reduce((total: number, entry: CommissionWithRelations) => total + entry.amount, 0);
    const grossBySource = new Map<string, number>();
    for (const entry of entries) {
      const key = entry.appointmentId
        ? `appt:${entry.appointmentId}`
        : entry.queueItemId
          ? `queue:${entry.queueItemId}`
          : `entry:${entry.id}`;
      const amount = entry.appointmentId
        ? entry.appointment?.finalPrice ?? 0
        : entry.queueItem?.finalPrice ?? 0;
      grossBySource.set(key, amount);
    }
    return {
      grossTotal: [...grossBySource.values()].reduce((total, amount) => total + amount, 0),
      commissionTotal,
      byProfessional: [...byProfessional.values()].map((entry) => ({
        ...entry,
        commissionTotal: Math.round(entry.commissionTotal * 100) / 100,
      })),
    };
  }
}
