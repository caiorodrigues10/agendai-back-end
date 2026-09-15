import { prisma } from "@/libs/prismaClient";
import type { ProfitSettingsInput } from "./profitSchema";

const settingsSelect = {
  id: true,
  barbershopId: true,
  defaultTaxRate: true,
  defaultCommission: true,
  overheadCategories: true,
  createdAt: true,
  updatedAt: true,
} as const;

const entrySelect = {
  id: true,
  barbershopId: true,
  period: true,
  serviceId: true,
  staffId: true,
  revenue: true,
  directCosts: true,
  overheadCosts: true,
  taxAmount: true,
  commissionAmt: true,
  netProfit: true,
  marginPercent: true,
  computedAt: true,
} as const;

export class ProfitRepository {
  async getSettings(barbershopId: string) {
    return prisma.profitSettings.findUnique({
      where: { barbershopId },
      select: settingsSelect,
    });
  }

  async upsertSettings(barbershopId: string, data: ProfitSettingsInput) {
    return prisma.profitSettings.upsert({
      where: { barbershopId },
      create: {
        barbershopId,
        defaultTaxRate: data.defaultTaxRate,
        defaultCommission: data.defaultCommission,
        overheadCategories: data.overheadCategories,
      },
      update: {
        defaultTaxRate: data.defaultTaxRate,
        defaultCommission: data.defaultCommission,
        overheadCategories: data.overheadCategories,
      },
      select: settingsSelect,
    });
  }

  async getEntriesByPeriod(barbershopId: string, period: Date) {
    return prisma.profitEntry.findMany({
      where: {
        barbershopId,
        period,
      },
      select: entrySelect,
      orderBy: [{ serviceId: "asc" }, { staffId: "asc" }],
    });
  }

  async upsertEntry(
    barbershopId: string,
    period: Date,
    serviceId: string | null,
    staffId: string | null,
    data: {
      revenue: number;
      directCosts: number;
      overheadCosts: number;
      taxAmount: number;
      commissionAmt: number;
      netProfit: number;
      marginPercent: number;
    }
  ) {
    return prisma.profitEntry.upsert({
      where: {
        barbershopId_period_serviceId_staffId: {
          barbershopId,
          period,
          serviceId: serviceId ?? "",
          staffId: staffId ?? "",
        },
      },
      create: {
        barbershopId,
        period,
        serviceId: serviceId ?? null,
        staffId: staffId ?? null,
        revenue: data.revenue,
        directCosts: data.directCosts,
        overheadCosts: data.overheadCosts,
        taxAmount: data.taxAmount,
        commissionAmt: data.commissionAmt,
        netProfit: data.netProfit,
        marginPercent: data.marginPercent,
      },
      update: {
        revenue: data.revenue,
        directCosts: data.directCosts,
        overheadCosts: data.overheadCosts,
        taxAmount: data.taxAmount,
        commissionAmt: data.commissionAmt,
        netProfit: data.netProfit,
        marginPercent: data.marginPercent,
        computedAt: new Date(),
      },
      select: entrySelect,
    });
  }

  async getTrend(barbershopId: string, months: number) {
    const now = new Date();
    const startPeriod = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    return prisma.profitEntry.findMany({
      where: {
        barbershopId,
        period: { gte: startPeriod },
        serviceId: null,
        staffId: null,
      },
      select: {
        period: true,
        revenue: true,
        directCosts: true,
        overheadCosts: true,
        taxAmount: true,
        commissionAmt: true,
        netProfit: true,
        marginPercent: true,
      },
      orderBy: { period: "asc" },
    });
  }

  async getByService(barbershopId: string, period?: Date) {
    const where: Record<string, unknown> = {
      barbershopId,
      serviceId: { not: null },
      staffId: null,
    };
    if (period) where.period = period;

    return prisma.profitEntry.findMany({
      where,
      select: {
        ...entrySelect,
        period: true,
      },
      orderBy: { revenue: "desc" },
    });
  }

  async getByStaff(barbershopId: string, period?: Date) {
    const where: Record<string, unknown> = {
      barbershopId,
      staffId: { not: null },
      serviceId: null,
    };
    if (period) where.period = period;

    return prisma.profitEntry.findMany({
      where,
      select: {
        ...entrySelect,
        period: true,
      },
      orderBy: { revenue: "desc" },
    });
  }

  async deleteEntriesForPeriod(barbershopId: string, period: Date) {
    return prisma.profitEntry.deleteMany({
      where: { barbershopId, period },
    });
  }

  async getCompletedAppointments(barbershopId: string, period: Date) {
    const year = period.getFullYear();
    const month = period.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

    return prisma.appointment.findMany({
      where: {
        barbershopId,
        status: "COMPLETED",
        date: { gte: start, lte: end },
      },
      select: {
        id: true,
        serviceId: true,
        staffId: true,
        service: { select: { id: true, name: true, price: true, commissionPercent: true } },
        staff: { select: { id: true, name: true } },
      },
    });
  }

  async getExpenses(barbershopId: string, period: Date) {
    const year = period.getFullYear();
    const month = period.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

    return prisma.expense.findMany({
      where: {
        barbershopId,
        referenceDate: { gte: start, lte: end },
      },
      select: {
        id: true,
        amount: true,
        type: true,
        categoryId: true,
      },
    });
  }

  async getCommissions(barbershopId: string, period: Date) {
    const year = period.getFullYear();
    const month = period.getMonth();
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

    return prisma.commissionEntry.findMany({
      where: {
        barbershopId,
        createdAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        serviceId: true,
        professionalId: true,
        percentage: true,
        amount: true,
      },
    });
  }
}
