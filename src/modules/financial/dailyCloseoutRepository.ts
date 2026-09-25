import { prisma } from "@/libs/prismaClient";
import { Decimal } from "@prisma/client/runtime/library";

export interface DailyCloseoutData {
  balanceOpen: number;
  cashReceived: number;
  pixReceived: number;
  cardReceived: number;
  fiadoCreated: number;
  fiadoPaid: number;
  expenses: number;
  commissions: number;
  productSales: number;
  discrepancy?: number | null;
  notes?: string | null;
  closedBy?: string | null;
  closedAt?: Date | null;
}

export interface DailyCloseoutResponse {
  id: string;
  barbershopId: string;
  date: Date;
  balanceOpen: Decimal;
  cashReceived: Decimal;
  pixReceived: Decimal;
  cardReceived: Decimal;
  fiadoCreated: Decimal;
  fiadoPaid: Decimal;
  expenses: Decimal;
  commissions: Decimal;
  productSales: Decimal;
  discrepancy: Decimal | null;
  notes: string | null;
  closedBy: string | null;
  closedAt: Date | null;
  createdAt: Date;
}

export class DailyCloseoutRepository {
  /**
   * Upsert atômico (INSERT ... ON CONFLICT no Postgres). O padrão antigo
   * findUnique → create/update corria com requisições concorrentes: dois
   * POSTs simultâneos liam null e ambos tentavam create → P2002 (500).
   */
  async upsert(
    barbershopId: string,
    date: Date,
    data: DailyCloseoutData
  ): Promise<DailyCloseoutResponse> {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    const fields = {
      balanceOpen: data.balanceOpen,
      cashReceived: data.cashReceived,
      pixReceived: data.pixReceived,
      cardReceived: data.cardReceived,
      fiadoCreated: data.fiadoCreated,
      fiadoPaid: data.fiadoPaid,
      expenses: data.expenses,
      commissions: data.commissions,
      productSales: data.productSales,
      discrepancy: data.discrepancy ?? null,
      notes: data.notes ?? null,
      closedBy: data.closedBy ?? null,
      closedAt: data.closedAt ?? new Date(),
    };

    try {
      return await prisma.dailyCloseout.upsert({
        where: { barbershopId_date: { barbershopId, date: normalizedDate } },
        create: { barbershopId, date: normalizedDate, ...fields },
        update: fields,
      });
    } catch (err) {
      // Fallback defensivo: em cenários em que o Prisma não usa upsert nativo,
      // P2002 significa que outra requisição criou a linha — vira update.
      const isUniqueViolation =
        typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
      if (!isUniqueViolation) throw err;
      return prisma.dailyCloseout.update({
        where: { barbershopId_date: { barbershopId, date: normalizedDate } },
        data: fields,
      });
    }
  }

  async findByDate(
    barbershopId: string,
    date: Date
  ): Promise<DailyCloseoutResponse | null> {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    return prisma.dailyCloseout.findUnique({
      where: { barbershopId_date: { barbershopId, date: normalizedDate } },
    });
  }

  async list(
    barbershopId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DailyCloseoutResponse[]> {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return prisma.dailyCloseout.findMany({
      where: {
        barbershopId,
        date: { gte: start, lte: end },
      },
      orderBy: { date: "desc" },
    });
  }
}
