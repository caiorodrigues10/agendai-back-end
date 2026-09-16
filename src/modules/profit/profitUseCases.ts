import { ProfitRepository } from "./profitRepository";
import { AppError } from "@/shared/errors/AppError";
import type { ProfitSettingsInput } from "./profitSchema";

export class ProfitUseCases {
  private repo = new ProfitRepository();

  async getSettings(barbershopId: string) {
    const settings = await this.repo.getSettings(barbershopId);
    if (!settings) {
      return this.repo.upsertSettings(barbershopId, {
        defaultTaxRate: 0,
        defaultCommission: 0,
        overheadCategories: {},
      });
    }
    return settings;
  }

  async updateSettings(barbershopId: string, data: ProfitSettingsInput) {
    return this.repo.upsertSettings(barbershopId, data);
  }

  async getPeriodProfit(barbershopId: string, periodStr: string) {
    const period = this.parsePeriod(periodStr);
    const entries = await this.repo.getEntriesByPeriod(barbershopId, period);

    const totals = entries.reduce(
      (acc: { revenue: number; directCosts: number; overheadCosts: number; taxAmount: number; commissionAmt: number; netProfit: number }, e: { revenue: unknown; directCosts: unknown; overheadCosts: unknown; taxAmount: unknown; commissionAmt: unknown; netProfit: unknown }) => ({
        revenue: acc.revenue + Number(e.revenue),
        directCosts: acc.directCosts + Number(e.directCosts),
        overheadCosts: acc.overheadCosts + Number(e.overheadCosts),
        taxAmount: acc.taxAmount + Number(e.taxAmount),
        commissionAmt: acc.commissionAmt + Number(e.commissionAmt),
        netProfit: acc.netProfit + Number(e.netProfit),
      }),
      { revenue: 0, directCosts: 0, overheadCosts: 0, taxAmount: 0, commissionAmt: 0, netProfit: 0 }
    );

    const totalRevenue = totals.revenue;
    const marginPercent = totalRevenue > 0 ? (totals.netProfit / totalRevenue) * 100 : 0;

    return {
      period: periodStr,
      entries,
      totals: { ...totals, marginPercent },
    };
  }

  async computePeriod(barbershopId: string, periodStr: string) {
    const period = this.parsePeriod(periodStr);
    const settings = await this.getSettings(barbershopId);

    await this.repo.deleteEntriesForPeriod(barbershopId, period);

    const [appointments, expenses, commissions] = await Promise.all([
      this.repo.getCompletedAppointments(barbershopId, period),
      this.repo.getExpenses(barbershopId, period),
      this.repo.getCommissions(barbershopId, period),
    ]);

    const totalExpenses = expenses.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0);
    const overheadCosts = totalExpenses;
    const taxRate = settings.defaultTaxRate / 100;

    const serviceMap = new Map<string, { revenue: number; count: number }>();
    const staffMap = new Map<string, { revenue: number; commission: number; count: number }>();
    const staffServiceCommissions = new Map<string, number>();

    for (const c of commissions) {
      const key = `${c.professionalId}:${c.serviceId}`;
      staffServiceCommissions.set(key, (staffServiceCommissions.get(key) ?? 0) + c.amount);
    }

    let totalRevenue = 0;
    let totalCommission = 0;

    for (const appt of appointments) {
      const price = appt.service?.price ?? 0;
      totalRevenue += price;

      const svcId = appt.serviceId;
      const prev = serviceMap.get(svcId) ?? { revenue: 0, count: 0 };
      serviceMap.set(svcId, { revenue: prev.revenue + price, count: prev.count + 1 });

      if (appt.staffId) {
        const sPrev = staffMap.get(appt.staffId) ?? { revenue: 0, commission: 0, count: 0 };
        const commKey = `${appt.staffId}:${svcId}`;
        const commAmt = staffServiceCommissions.get(commKey) ?? 0;
        totalCommission += commAmt;
        staffMap.set(appt.staffId, {
          revenue: sPrev.revenue + price,
          commission: sPrev.commission + commAmt,
          count: sPrev.count + 1,
        });
      }
    }

    const totalTax = totalRevenue * taxRate;
    const netProfitTotal = totalRevenue - overheadCosts - totalTax - totalCommission;
    const marginTotal = totalRevenue > 0 ? (netProfitTotal / totalRevenue) * 100 : 0;

    const totalEntry = await this.repo.upsertEntry(barbershopId, period, null, null, {
      revenue: totalRevenue,
      directCosts: 0,
      overheadCosts,
      taxAmount: totalTax,
      commissionAmt: totalCommission,
      netProfit: netProfitTotal,
      marginPercent: marginTotal,
    });

    const serviceEntries = [];
    for (const [serviceId, data] of serviceMap) {
      const svcTax = data.revenue * taxRate;
      const svcNet = data.revenue - svcTax;
      const svcMargin = data.revenue > 0 ? (svcNet / data.revenue) * 100 : 0;

      const entry = await this.repo.upsertEntry(barbershopId, period, serviceId, null, {
        revenue: data.revenue,
        directCosts: 0,
        overheadCosts: 0,
        taxAmount: svcTax,
        commissionAmt: 0,
        netProfit: svcNet,
        marginPercent: svcMargin,
      });
      serviceEntries.push(entry);
    }

    const staffEntries = [];
    for (const [staffId, data] of staffMap) {
      const staffTax = data.revenue * taxRate;
      const staffNet = data.revenue - data.commission - staffTax;
      const staffMargin = data.revenue > 0 ? (staffNet / data.revenue) * 100 : 0;

      const entry = await this.repo.upsertEntry(barbershopId, period, null, staffId, {
        revenue: data.revenue,
        directCosts: 0,
        overheadCosts: 0,
        taxAmount: staffTax,
        commissionAmt: data.commission,
        netProfit: staffNet,
        marginPercent: staffMargin,
      });
      staffEntries.push(entry);
    }

    return {
      period: periodStr,
      totals: totalEntry,
      byService: serviceEntries,
      byStaff: staffEntries,
      summary: {
        totalAppointments: appointments.length,
        totalExpenses,
        totalRevenue,
        totalCommission,
        totalTax,
        netProfit: netProfitTotal,
        marginPercent: marginTotal,
      },
    };
  }

  async getTrend(barbershopId: string, months: number) {
    const entries = await this.repo.getTrend(barbershopId, months);
    const finiteNumber = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return entries.map((e: { period: Date; revenue: unknown; netProfit: unknown; marginPercent: number }) => ({
      period: e.period.toISOString().slice(0, 7),
      revenue: finiteNumber(e.revenue),
      netProfit: finiteNumber(e.netProfit),
      marginPercent: finiteNumber(e.marginPercent),
    }));
  }

  async getByService(barbershopId: string, period?: string) {
    const p = period ? this.parsePeriod(period) : undefined;
    return this.repo.getByService(barbershopId, p);
  }

  async getByStaff(barbershopId: string, period?: string) {
    const p = period ? this.parsePeriod(period) : undefined;
    return this.repo.getByStaff(barbershopId, p);
  }

  private parsePeriod(periodStr: string): Date {
    const match = periodStr.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
      throw new AppError("Formato de período inválido. Use YYYY-MM.", 400);
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) {
      throw new AppError("Mês inválido no período. Use valores entre 01 e 12.", 400);
    }
    return new Date(year, month - 1, 1);
  }
}
