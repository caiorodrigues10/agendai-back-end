/**
 * Cálculo de lucro — função pura, compartilhada.
 *
 * O motor de lucro do painel (`ProfitUseCases.computePeriod`) e a aba
 * "Resumo" da exportação usam **esta mesma função** — assim o total da
 * planilha é igual ao do relatório do app por construção, sem reimplementar
 * regra de negócio.
 */

export interface ProfitAppointment {
  serviceId: string | null;
  staffId: string | null;
  finalPrice: unknown;
  clientPackageId?: string | null;
  service?: { price?: unknown } | null;
}

export interface ProfitQueueItem {
  serviceId: string | null;
  completedBy: string | null;
  finalPrice: unknown;
  service?: { price?: unknown } | null;
}

export interface ProfitExpense {
  amount: unknown;
  categoryId?: string | null;
  inventoryReceiptId?: string | null;
}

export interface ProfitCommission {
  serviceId: string | null;
  professionalId: string | null;
  percentage?: unknown;
  amount: unknown;
}

export interface ProfitSettings {
  defaultTaxRate: number;
  defaultCommission: number;
  overheadCategories?: Record<string, unknown> | null;
}

export interface ProfitCalculationInput {
  appointments: ProfitAppointment[];
  queueItems: ProfitQueueItem[];
  expenses: ProfitExpense[];
  commissions: ProfitCommission[];
  retail: { netRevenue: number; cogs: number };
  settings: ProfitSettings;
}

export interface ServiceAccumulator {
  revenue: number;
  count: number;
}

export interface StaffAccumulator {
  revenue: number;
  commission: number;
  count: number;
}

export interface ProfitCalculation {
  totals: {
    revenue: number;
    directCosts: number;
    overheadCosts: number;
    operationalCosts: number;
    taxAmount: number;
    commissionAmt: number;
    netProfit: number;
    marginPercent: number;
  };
  byService: Map<string, ServiceAccumulator>;
  byStaff: Map<string, StaffAccumulator>;
  summary: {
    totalAppointments: number;
    totalExpenses: number;
    totalRevenue: number;
    serviceRevenue: number;
    productRevenue: number;
    totalCommission: number;
    totalTax: number;
    directCosts: number;
    overheadCosts: number;
    operationalCosts: number;
    netProfit: number;
    marginPercent: number;
  };
}

function sumAmounts(list: Array<{ amount: unknown }>): number {
  return list.reduce((sum, e) => sum + Number(e.amount), 0);
}

/**
 * Calcula o lucro do período a partir das MESMAS fontes do motor de lucro.
 * Não grava nada — quem chama decide se persiste (o app) ou só lê (exportação).
 */
export function calculateProfit(input: ProfitCalculationInput): ProfitCalculation {
  const { appointments, queueItems, expenses, commissions, retail, settings } = input;

  const overheadKeys = Object.keys(settings.overheadCategories ?? {});
  // Compra de estoque não é custo do período (entra no CMV quando o produto é vendido)
  const periodExpenses = expenses.filter((e) => !e.inventoryReceiptId);
  const overheadList =
    overheadKeys.length > 0
      ? periodExpenses.filter((e) => !!e.categoryId && overheadKeys.includes(e.categoryId))
      : periodExpenses;
  const overheadCosts = sumAmounts(overheadList);
  const operationalCosts = sumAmounts(periodExpenses) - overheadCosts;
  const taxRate = settings.defaultTaxRate / 100;

  const serviceMap = new Map<string, ServiceAccumulator>();
  const staffMap = new Map<string, StaffAccumulator>();
  const staffServiceCommissions = new Map<string, number>();

  for (const c of commissions) {
    const key = `${c.professionalId}:${c.serviceId}`;
    staffServiceCommissions.set(key, (staffServiceCommissions.get(key) ?? 0) + Number(c.amount));
  }

  let serviceRevenue = 0;
  let totalCommission = 0;

  const creditService = (price: number, svcId: string | null, staffId: string | null): void => {
    serviceRevenue += price;
    if (svcId) {
      const prev = serviceMap.get(svcId) ?? { revenue: 0, count: 0 };
      serviceMap.set(svcId, { revenue: prev.revenue + price, count: prev.count + 1 });
    }
    if (staffId && svcId) {
      const sPrev = staffMap.get(staffId) ?? { revenue: 0, commission: 0, count: 0 };
      const commKey = `${staffId}:${svcId}`;
      const commAmt = staffServiceCommissions.get(commKey) ?? 0;
      totalCommission += commAmt;
      staffMap.set(staffId, {
        revenue: sPrev.revenue + price,
        commission: sPrev.commission + commAmt,
        count: sPrev.count + 1,
      });
    }
  };

  for (const appt of appointments) {
    // Sessão de pacote: consumo sem receita e sem comissão
    if (appt.clientPackageId) continue;
    const price = Number(appt.finalPrice ?? appt.service?.price ?? 0);
    creditService(price, appt.serviceId, appt.staffId);
  }

  for (const item of queueItems) {
    const price = Number(item.finalPrice ?? item.service?.price ?? 0);
    creditService(price, item.serviceId, item.completedBy ?? null);
  }

  const productRevenue = retail.netRevenue;
  const totalRevenue = serviceRevenue + productRevenue;
  const directCosts = retail.cogs;
  const totalTax = totalRevenue * taxRate;
  const netProfitTotal =
    totalRevenue - directCosts - overheadCosts - operationalCosts - totalTax - totalCommission;
  const marginTotal = totalRevenue > 0 ? (netProfitTotal / totalRevenue) * 100 : 0;
  const totalExpenses = sumAmounts(expenses);

  return {
    totals: {
      revenue: totalRevenue,
      directCosts,
      overheadCosts,
      operationalCosts,
      taxAmount: totalTax,
      commissionAmt: totalCommission,
      netProfit: netProfitTotal,
      marginPercent: marginTotal,
    },
    byService: serviceMap,
    byStaff: staffMap,
    summary: {
      totalAppointments: appointments.length + queueItems.length,
      totalExpenses,
      totalRevenue,
      serviceRevenue,
      productRevenue,
      totalCommission,
      totalTax,
      directCosts,
      overheadCosts,
      operationalCosts,
      netProfit: netProfitTotal,
      marginPercent: marginTotal,
    },
  };
}
