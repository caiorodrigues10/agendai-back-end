import { prisma } from "@/libs/prismaClient";
import { Decimal } from "@prisma/client/runtime/library";
import {
  DailyCloseoutRepository,
  DailyCloseoutData,
  DailyCloseoutResponse,
} from "./dailyCloseoutRepository";
import { calendarDateKey, getShopTimezone, shopDayRange } from "./ledger/shopTime";
import {
  summarizeCashByMethod,
  summarizeRevenue,
  sumLedger,
  LedgerRow,
} from "./ledger/financialLedger";

/** Campos declarados (opcionais) vs. agregados do ledger quando omitidos. */
export interface CloseoutPayload {
  balanceOpen: number;
  cashReceived?: number;
  pixReceived?: number;
  cardReceived?: number;
  discrepancy?: number | null;
  notes?: string | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface DayFigures {
  /** Efeito líquido no caixa em dinheiro (entrada − saída) do dia. */
  cashReceived: number;
  pixReceived: number;
  cardReceived: number;
  fiadoCreated: number;
  fiadoPaid: number;
  expenses: number;
  commissions: number;
  productSales: number;
}

/**
 * Fonte única dos números do dia: tudo lido do ledger (CashMovement) no fuso do
 * salão, com a mesma convenção de sinal usada pelo painel de caixa.
 * Não grava nada — serve tanto o POST quanto o preview do GET.
 */
export async function computeDay(barbershopId: string, calendarDate: string): Promise<DayFigures> {
  const timezone = await getShopTimezone(barbershopId);
  const { start, end } = shopDayRange(calendarDate, timezone);

  const [cashMovements, fiados, commissions] = await Promise.all([
    prisma.cashMovement.findMany({
      where: { barbershopId, occurredAt: { gte: start, lte: end } },
    }),
    prisma.fiado.findMany({
      where: { barbershopId, createdAt: { gte: start, lte: end } },
      select: { originalAmount: true },
    }),
    prisma.commissionEntry.aggregate({
      where: { barbershopId, createdAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ]);

  const rows = cashMovements as LedgerRow[];
  const cashByMethod = summarizeCashByMethod(rows);
  const revenue = summarizeRevenue(rows);

  return {
    cashReceived: round2(cashByMethod.CASH ?? 0),
    pixReceived: round2(cashByMethod.PIX ?? 0),
    cardReceived: round2((cashByMethod.CREDIT_CARD ?? 0) + (cashByMethod.DEBIT_CARD ?? 0)),
    fiadoCreated: round2(
      fiados.reduce((sum: number, f: { originalAmount: number }) => sum + f.originalAmount, 0),
    ),
    fiadoPaid: round2(sumLedger(rows, ["FIADO_PAYMENT"])),
    expenses: round2(sumLedger(rows, ["EXPENSE"])),
    commissions: round2(commissions._sum.amount ?? 0),
    productSales: revenue.products,
  };
}

export class DailyCloseoutUseCases {
  private repo = new DailyCloseoutRepository();

  async closeDay(
    barbershopId: string,
    date: Date,
    userId: string,
    payload: CloseoutPayload
  ): Promise<DailyCloseoutResponse> {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    const figures = await computeDay(barbershopId, calendarDateKey(normalizedDate));

    // Caixa contado declarado tem prioridade; omitido => líquido do ledger.
    const cashReceived = payload.cashReceived ?? figures.cashReceived;
    // Discrepância calculada: contado − (saldo inicial + entradas líquidas em dinheiro).
    const discrepancy =
      payload.cashReceived !== undefined
        ? round2(payload.cashReceived - (payload.balanceOpen + figures.cashReceived))
        : payload.discrepancy ?? null;

    const data: DailyCloseoutData = {
      balanceOpen: payload.balanceOpen,
      cashReceived,
      pixReceived: payload.pixReceived ?? figures.pixReceived,
      cardReceived: payload.cardReceived ?? figures.cardReceived,
      fiadoCreated: figures.fiadoCreated,
      fiadoPaid: figures.fiadoPaid,
      expenses: figures.expenses,
      commissions: figures.commissions,
      productSales: figures.productSales,
      discrepancy,
      notes: payload.notes ?? null,
      closedBy: userId,
      closedAt: new Date(),
    };

    return this.repo.upsert(barbershopId, normalizedDate, data);
  }

  async getCloseout(barbershopId: string, date: Date): Promise<DailyCloseoutResponse> {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    const existing = await this.repo.findByDate(barbershopId, normalizedDate);
    if (existing) return existing;

    const figures = await computeDay(barbershopId, calendarDateKey(normalizedDate));

    // GET não pode gravar: devolve um preview em memória quando não há
    // fechamento salvo (evita upsert em leitura e corrida de unique constraint)
    return {
      id: "",
      barbershopId,
      date: normalizedDate,
      balanceOpen: new Decimal(0),
      cashReceived: new Decimal(figures.cashReceived),
      pixReceived: new Decimal(figures.pixReceived),
      cardReceived: new Decimal(figures.cardReceived),
      fiadoCreated: new Decimal(figures.fiadoCreated),
      fiadoPaid: new Decimal(figures.fiadoPaid),
      expenses: new Decimal(figures.expenses),
      commissions: new Decimal(figures.commissions),
      productSales: new Decimal(figures.productSales),
      discrepancy: null,
      notes: "Auto-calculated from ledger",
      closedBy: null,
      closedAt: null,
      createdAt: new Date(),
    };
  }
}
