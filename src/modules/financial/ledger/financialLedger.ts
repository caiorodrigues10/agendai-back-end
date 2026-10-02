import { Prisma } from "@prisma/client";
import { normalizePaymentMethod, type LedgerPaymentMethod } from "./paymentMethod";

/**
 * Livro financeiro único do salão — gravado na MESMA transação da operação de
 * origem (conclusão de atendimento, venda de produto/pacote, pagamento de fiado,
 * despesa paga, estorno). Idempotente por (barbershopId, sourceType, sourceId, kind):
 * reprocessar uma requisição nunca duplica valor, comissão ou caixa.
 */

export const LEDGER_KINDS = [
  "SERVICE_SALE",
  "PRODUCT_SALE",
  "PACKAGE_SALE",
  "FIADO_PAYMENT",
  "REFUND",
  "EXPENSE",
  "COMMISSION_PAYOUT",
  "TIP",
  "OTHER",
  "SUPPLY",
  "WITHDRAWAL",
  "ADJUSTMENT",
] as const;

export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** Tipos contados como entrada de caixa (mesma convenção já usada pelo painel). */
export const LEDGER_INFLOW_KINDS: LedgerKind[] = [
  "SERVICE_SALE",
  "PRODUCT_SALE",
  "PACKAGE_SALE",
  "FIADO_PAYMENT",
  "TIP",
  "OTHER",
];

export function isLedgerInflow(kind: string): boolean {
  return LEDGER_INFLOW_KINDS.includes(kind as LedgerKind);
}

/** Sinal aplicado ao valor para saber o efeito no caixa (+entrada / −saída). */
export function ledgerSignedAmount(kind: string, amount: number): number {
  return isLedgerInflow(kind) ? amount : -amount;
}

export interface LedgerEntryInput {
  barbershopId: string;
  kind: LedgerKind;
  /** Sempre positivo: a direção (entrada/saída) vem do `kind`. */
  amount: number;
  /** Bruto (ex.: "pix", "card"); normalizado para CASH/PIX/... antes de gravar. */
  paymentMethod?: string | null;
  sourceType: string;
  sourceId: string;
  /** Instante real do evento (fuso do salão define o dia; default = agora). */
  occurredAt?: Date;
  professionalId?: string | null;
  clientId?: string | null;
  /** Lançamento de origem vinculado (venda estornada, fiado pago, ...). */
  relatedSourceId?: string | null;
  description?: string | null;
  createdBy: string;
}

export function ledgerIdempotencyKey(input: {
  barbershopId: string;
  sourceType: string;
  sourceId: string;
  kind: string;
}): string {
  return `${input.barbershopId}:${input.sourceType}:${input.sourceId}:${input.kind}`;
}

type CashMovementDelegate = {
  findFirst(args?: unknown): PromiseLike<{ id: string } | null>;
  create(args: unknown): PromiseLike<unknown>;
  deleteMany(args: unknown): PromiseLike<unknown>;
};

type CashMovementClient = { cashMovement: CashMovementDelegate };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ((error as { code?: string }).code === "P2002" ||
      (error as { code?: string }).code === "P2001")
  );
}

/**
 * Grava (ou confirma, se já existir) o lançamento no ledger.
 * Nunca altera um lançamento já gravado — apenas retorna.
 * Aceita `prisma` ou um `tx` de `$transaction` para rodar na transação de origem.
 */
export async function recordLedgerEntry(
  client: CashMovementClient,
  input: LedgerEntryInput,
): Promise<{ id: string; created: boolean } | null> {
  if (!Number.isFinite(input.amount)) return null;

  const where = {
    OR: [
      { idempotencyKey: ledgerIdempotencyKey(input) },
      {
        barbershopId: input.barbershopId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        type: input.kind,
      },
    ],
  };

  const existing = await client.cashMovement.findFirst({ where, select: { id: true } });
  if (existing) return { id: existing.id, created: false };

  try {
    const created = (await client.cashMovement.create({
      data: {
        barbershopId: input.barbershopId,
        type: input.kind,
        amount: new Prisma.Decimal(Math.abs(input.amount)),
        paymentMethod: normalizePaymentMethod(input.paymentMethod),
        description: input.description ?? null,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        relatedSourceId: input.relatedSourceId ?? null,
        occurredAt: input.occurredAt ?? new Date(),
        professionalId: input.professionalId ?? null,
        clientId: input.clientId ?? null,
        idempotencyKey: ledgerIdempotencyKey(input),
        createdBy: input.createdBy,
      },
    })) as { id: string };
    return { id: created.id, created: true };
  } catch (error) {
    // Corrida com outra requisição idêntica: a outra venceu, a operação segue.
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/** Remove lançamentos de uma origem (ex.: despesa com paidAt reagendado). */
export async function deleteLedgerEntries(
  client: CashMovementClient,
  input: { barbershopId: string; sourceType: string; sourceId: string; kind?: LedgerKind },
): Promise<void> {
  await client.cashMovement.deleteMany({
    where: {
      barbershopId: input.barbershopId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      ...(input.kind ? { type: input.kind } : {}),
    },
  });
}

// ─── Agregações usadas por fechamento/insights/rentabilidade ──────────────────

export type LedgerRow = {
  type: string;
  amount: unknown;
  paymentMethod: string;
  occurredAt: Date;
  sourceType: string | null;
  sourceId: string | null;
  professionalId?: string | null;
  relatedSourceId?: string | null;
};

export function amountToNumber(amount: unknown): number {
  const value = typeof amount === "object" && amount !== null && "toNumber" in amount
    ? (amount as { toNumber: () => number }).toNumber()
    : Number(amount);
  return Number.isFinite(value) ? value : 0;
}

/** Receita bruta por fonte (desconta estornos), sem contar cobrança de fiado. */
export function summarizeRevenue(rows: LedgerRow[]): {
  services: number;
  products: number;
  packages: number;
  refunds: number;
  total: number;
} {
  let services = 0;
  let products = 0;
  let packages = 0;
  let refunds = 0;
  for (const row of rows) {
    const amount = amountToNumber(row.amount);
    if (row.type === "SERVICE_SALE") services += amount;
    else if (row.type === "PRODUCT_SALE") products += amount;
    else if (row.type === "PACKAGE_SALE") packages += amount;
    else if (row.type === "REFUND") refunds += amount;
  }
  const total = Math.round((services + products + packages - refunds) * 100) / 100;
  return {
    services: Math.round(services * 100) / 100,
    products: Math.round(products * 100) / 100,
    packages: Math.round(packages * 100) / 100,
    refunds: Math.round(refunds * 100) / 100,
    total,
  };
}

/**
 * Efeito no caixa por forma de pagamento.
 * Lançamentos com método FIADO não movimentam caixa (a entrada só ocorre no
 * pagamento do fiado, que entra com a forma de pagamento usada no recebimento).
 */
export function summarizeCashByMethod(rows: LedgerRow[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const row of rows) {
    if (row.paymentMethod === "FIADO") continue;
    const signed = ledgerSignedAmount(row.type, amountToNumber(row.amount));
    summary[row.paymentMethod] = Math.round(((summary[row.paymentMethod] ?? 0) + signed) * 100) / 100;
  }
  return summary;
}

export function sumLedger(rows: LedgerRow[], kinds: LedgerKind[]): number {
  const set = new Set<string>(kinds);
  const total = rows.reduce((sum, row) => (set.has(row.type) ? sum + amountToNumber(row.amount) : sum), 0);
  return Math.round(total * 100) / 100;
}

/** Forma canônica de tipos de pagamento vindos de models (RetailSale, Appointment, ...). */
export { normalizePaymentMethod };
export type { LedgerPaymentMethod };
export { Prisma };
