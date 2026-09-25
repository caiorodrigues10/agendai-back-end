import { prisma } from "@/libs/prismaClient";
import { Prisma } from "@prisma/client";

export interface CreateCashMovementData {
  barbershopId: string;
  type: string;
  amount: number;
  paymentMethod: string;
  description?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  idempotencyKey?: string | null;
  createdBy: string;
}

export interface CashMovementFilters {
  date?: Date;
  paymentMethod?: string;
  type?: string;
}

export class CashMovementRepository {
  async create(data: CreateCashMovementData) {
    if (data.idempotencyKey) {
      const existing = await prisma.cashMovement.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) return existing;
    }

    return prisma.cashMovement.create({
      data: {
        barbershopId: data.barbershopId,
        type: data.type,
        amount: new Prisma.Decimal(data.amount),
        paymentMethod: data.paymentMethod,
        description: data.description ?? null,
        sourceType: data.sourceType ?? null,
        sourceId: data.sourceId ?? null,
        idempotencyKey: data.idempotencyKey ?? null,
        createdBy: data.createdBy,
      },
    });
  }

  async list(barbershopId: string, filters: CashMovementFilters) {
    const where: Prisma.CashMovementWhereInput = { barbershopId };

    if (filters.date) {
      const start = new Date(filters.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.date);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
    if (filters.type) where.type = filters.type;

    return prisma.cashMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async getSummary(barbershopId: string, date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const movements = await prisma.cashMovement.findMany({
      where: {
        barbershopId,
        createdAt: { gte: start, lte: end },
      },
    });

    const summary: Record<string, { total: number; count: number }> = {};
    for (const m of movements) {
      if (!summary[m.paymentMethod]) {
        summary[m.paymentMethod] = { total: 0, count: 0 };
      }
      const amt = Number(m.amount);
      const isIn = ["SERVICE_SALE", "PRODUCT_SALE", "PACKAGE_SALE", "FIADO_PAYMENT", "TIP", "OTHER"].includes(m.type);
      summary[m.paymentMethod].total += isIn ? amt : -amt;
      summary[m.paymentMethod].count += 1;
    }

    return { summary, totalMovements: movements.length };
  }

  async countByDate(barbershopId: string, date: Date): Promise<number> {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return prisma.cashMovement.count({
      where: {
        barbershopId,
        createdAt: { gte: start, lte: end },
      },
    });
  }
}
