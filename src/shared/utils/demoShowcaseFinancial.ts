import { createHash, randomBytes } from "node:crypto";
import { Prisma, type Product } from "@prisma/client";
import { getSegmentConfig } from "@/shared/segments";
import { AppError } from "@/shared/errors/AppError";
import {
  recordLedgerEntry,
  sumLedger,
  summarizeCashByMethod,
  summarizeRevenue,
  type LedgerRow,
} from "@/modules/financial/ledger/financialLedger";
import { nextStockQty, roundMoney, roundQty } from "@/modules/products/inventoryMath";
import { shopDateKey, shopDayRange } from "@/modules/financial/ledger/shopTime";
import { DEFAULT_SHOP_TIMEZONE } from "@/shared/utils/dateUtils";
import type { DemoShowcaseManifestBusiness } from "./demoShowcaseAssets";
import {
  addDaysToCivilDate,
  civilDateMinutesToUtc,
  civilDateToUtcDate,
  civilDateWeekday,
  demoShowcaseUuid,
  saoPauloCivilDate,
  startOfCivilMonth,
} from "./demoShowcaseHelpers";

type Tx = Prisma.TransactionClient;
type LedgerClient = Parameters<typeof recordLedgerEntry>[0];

type DemoCrmFinancialEventKind =
  | "SERVICE_COMPLETED"
  | "PACKAGE_SOLD"
  | "FIADO_CREATED"
  | "FIADO_PAYMENT"
  | "REFUND"
  | "PRODUCT_SOLD"
  | "PRODUCT_REFUNDED";

type LockedProduct = Pick<
  Product,
  | "id"
  | "barbershopId"
  | "name"
  | "active"
  | "type"
  | "trackStock"
  | "stockQty"
  | "salePrice"
  | "averageCost"
>;

type LockedFiado = {
  id: string;
  originalAmount: unknown;
  paidAmount: unknown;
  creditAdjustedAmount: unknown;
  status: string;
};

type DemoRetailSale = {
  id: string;
  barbershopId: string;
  clientId: string | null;
  soldById: string;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  total: number;
  totalCost: number;
  status: string;
  soldAt: Date;
  idempotencyKey: string;
};

type DemoRetailLine = {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  refundedQty: number;
};

type DemoSaleEntry = {
  sale: DemoRetailSale;
  line: DemoRetailLine;
  saleDay: string;
};

export const DEMO_FINANCIAL_NAMESPACES = {
  retailSale: "d1a0b01a",
  retailLine: "d1a0b01b",
  stockMovement: "d1a0b01c",
  fiado: "d1a0b01d",
  fiadoPayment: "d1a0b01e",
  crmEvent: "d1a0b01f",
  reviewInvitation: "d1a0b020",
  payment: "d1a0b021",
  dailyCloseout: "d1a0b022",
} as const;

export interface DemoFinancialStaff {
  id: string;
  name: string;
}

export interface DemoFinancialClient {
  id: string;
  name: string;
  whatsapp: string;
}

export interface DemoFinancialProduct {
  id: string;
  name: string;
  salePrice: number;
  averageCost: number;
  initialStock: number;
}

export interface DemoFinancialSummary {
  retailSaleCount: number;
  retailLineCount: number;
  stockMovementCount: number;
  fiadoCount: number;
  fiadoPaymentCount: number;
  crmFinancialEventCount: number;
  reviewInvitationCount: number;
  paymentCount: number;
  dailyCloseoutCount: number;
}

export interface DemoFinancialInput {
  business: DemoShowcaseManifestBusiness;
  shopId: string;
  ownerId: string;
  staff: DemoFinancialStaff[];
  clients: DemoFinancialClient[];
  products: DemoFinancialProduct[];
  today: string;
  now: Date;
  /** No refresh, movements/lines históricos são atualizados sem apagá-los. */
  refresh?: boolean;
}

const REVIEW_TOKEN_BYTES = 32;
const REVIEW_EXPIRY_DAYS = 14;
const REVIEW_CANDIDATE_AGE_DAYS = 45;

function financialUuid(namespace: string, key: string): string {
  return demoShowcaseUuid(namespace, `demo-showcase:${key}`);
}

function round2(value: number): number {
  return roundMoney(value);
}

function monthKeys(today: string, count = 3): string[] {
  const start = startOfCivilMonth(today);
  const [year, month] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    return date.toISOString().slice(0, 7);
  });
}

/** Dia civil de venda. No mês corrente, nunca escolhe um dia futuro. */
function saleDay(monthKey: string, index: number, today: string): string {
  if (monthKey === today.slice(0, 7)) {
    const currentDay = Number(today.slice(8, 10));
    const days = [1, Math.floor(currentDay / 3), Math.floor((currentDay * 2) / 3), currentDay].map(
      (day) => Math.max(1, Math.min(currentDay, day)),
    );
    return `${monthKey}-${String(days[index] ?? currentDay).padStart(2, "0")}`;
  }
  const days = [4, 9, 16, 24];
  return `${monthKey}-${String(days[index] ?? days[days.length - 1]).padStart(2, "0")}`;
}

function canonicalPaymentMethod(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase().replace(/-/g, "_");
  if (normalized === "CREDIT_CARD") return "CREDIT_CARD";
  if (normalized === "DEBIT_CARD") return "DEBIT_CARD";
  if (normalized === "CASH" || normalized === "DINHEIRO") return "CASH";
  if (normalized === "PIX") return "PIX";
  if (normalized === "FIADO") return "FIADO";
  return "OTHER";
}

function previousOpenDate(business: DemoShowcaseManifestBusiness, today: string): string {
  const config = getSegmentConfig(business.segmento);
  for (let offset = 1; offset <= 14; offset += 1) {
    const candidate = addDaysToCivilDate(today, -offset);
    if (config.schedulePreset[civilDateWeekday(candidate)]?.isOpen) return candidate;
  }
  return addDaysToCivilDate(today, -1);
}

function hashReviewToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function clampAtNow(value: Date, now: Date): Date {
  return new Date(Math.min(value.getTime(), now.getTime()));
}

/**
 * CRM local e transacional. O update vazio é intencional: eventos financeiros
 * são imutáveis e nunca podem ter valores ou occurredAt reescritos.
 */
async function recordDemoCrmFinancialEvent(
  tx: Tx,
  input: {
    id: string;
    barbershopId: string;
    clientId: string;
    kind: DemoCrmFinancialEventKind;
    sourceType: string;
    sourceId: string;
    grossAmount?: number;
    receivedAmount?: number;
    outstandingDelta?: number;
    occurredAt: Date;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.crmFinancialEvent.upsert({
    where: {
      barbershopId_sourceType_sourceId_kind: {
        barbershopId: input.barbershopId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        kind: input.kind,
      },
    },
    create: {
      id: input.id,
      barbershopId: input.barbershopId,
      clientId: input.clientId,
      kind: input.kind,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      grossAmount: input.grossAmount ?? 0,
      receivedAmount: input.receivedAmount ?? 0,
      outstandingDelta: input.outstandingDelta ?? 0,
      occurredAt: input.occurredAt,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
    update: {},
  });
}

/** Trava o produto canônico na mesma conexão da transação (RLS preservado). */
async function lockProduct(tx: Tx, shopId: string, productId: string): Promise<LockedProduct | null> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM products
    WHERE id = ${productId}::uuid
      AND "barbershopId" = ${shopId}::uuid
    FOR UPDATE
  `;
  if (locked.length === 0) return null;

  return tx.product.findFirst({
    where: { id: productId, barbershopId: shopId },
    select: {
      id: true,
      barbershopId: true,
      name: true,
      active: true,
      type: true,
      trackStock: true,
      stockQty: true,
      salePrice: true,
      averageCost: true,
    },
  });
}

function isSellableDemoProduct(product: LockedProduct): boolean {
  return product.active && product.type !== "CONSUMABLE" && product.trackStock;
}

async function lockDemoProducts(
  tx: Tx,
  shopId: string,
  productIds: string[],
): Promise<Map<string, LockedProduct>> {
  const lockedProducts = new Map<string, LockedProduct>();
  const uniqueIds = [...new Set(productIds)].sort();
  for (const productId of uniqueIds) {
    const product = await lockProduct(tx, shopId, productId);
    if (product) lockedProducts.set(product.id, product);
  }
  return lockedProducts;
}

/** Cria a venda sem reescrever uma venda já existente/estornada. */
async function ensureDemoRetailSale(
  tx: Tx,
  input: {
    business: DemoShowcaseManifestBusiness;
    shopId: string;
    ownerId: string;
    clientId: string;
    soldById: string;
    product: LockedProduct;
    quantity: number;
    paymentMethod: string;
    soldAt: Date;
    monthKey: string;
    index: number;
  },
): Promise<DemoSaleEntry> {
  const idempotencyKey = `demo-${input.business.id}-${input.monthKey}-${input.index}`;
  const saleId = financialUuid(
    DEMO_FINANCIAL_NAMESPACES.retailSale,
    `retail-sale:${input.business.id}:${input.monthKey}:${input.index}`,
  );
  const subtotal = round2(input.product.salePrice * input.quantity);
  const totalCost = round2(input.product.averageCost * input.quantity);

  const sale = await tx.retailSale.upsert({
    where: {
      barbershopId_idempotencyKey: {
        barbershopId: input.shopId,
        idempotencyKey,
      },
    },
    create: {
      id: saleId,
      barbershopId: input.shopId,
      clientId: input.clientId,
      soldById: input.soldById,
      paymentMethod: input.paymentMethod,
      subtotal,
      discount: 0,
      total: subtotal,
      totalCost,
      status: "COMPLETED",
      soldAt: input.soldAt,
      idempotencyKey,
    },
    // Uma venda existente pode já estar REFUNDED/CANCELED ou ter sido ajustada.
    // Seu estado terminal e seus valores são preservados.
    update: {},
  });

  const existingLines = await tx.retailSaleLine.findMany({
    where: { saleId: sale.id },
    orderBy: { id: "asc" },
  });
  let line = existingLines.find((row) => row.productId === input.product.id);

  if (!line) {
    const retailLineId = financialUuid(
      DEMO_FINANCIAL_NAMESPACES.retailLine,
      `retail-line:${input.business.id}:${input.monthKey}:${input.index}`,
    );
    line = await tx.retailSaleLine.upsert({
      where: { id: retailLineId },
      create: {
        id: retailLineId,
        barbershopId: input.shopId,
        saleId: sale.id,
        productId: input.product.id,
        productName: input.product.name,
        quantity: input.quantity,
        unitPrice: input.product.salePrice,
        unitCost: input.product.averageCost,
        refundedQty: 0,
      },
      // refundedQty é maintained pelo fluxo de estorno e nunca volta a zero.
      update: {},
    });
  }

  return {
    sale: sale as DemoRetailSale,
    line: line as DemoRetailLine,
    saleDay: saoPauloCivilDate(sale.soldAt),
  };
}

/**
 * Cria a cadeia de estoque sem apagar movimentos e sem baixar duas vezes.
 * A entrada inicial é createdAt antes da venda mais antiga; cada baixa nova é
 * gravada uma única vez e a última posição da cadeia reconcilia stockQty.
 */
async function seedDemoInventory(
  tx: Tx,
  input: {
    business: DemoShowcaseManifestBusiness;
    shopId: string;
    ownerId: string;
    products: Map<string, LockedProduct>;
    sales: DemoSaleEntry[];
  },
): Promise<number> {
  const { business, shopId, ownerId, products, sales } = input;
  if (products.size === 0) return 0;

  const earliestSaleDay = sales[0]?.saleDay ?? saoPauloCivilDate(new Date());
  const importDate = civilDateMinutesToUtc(addDaysToCivilDate(earliestSaleDay, -1), 8 * 60);
  let movementCount = 0;

  for (const product of [...products.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    const importMovementId = financialUuid(
      DEMO_FINANCIAL_NAMESPACES.stockMovement,
      `stock-import:${business.id}:${product.id}`,
    );
    const existingImport = await tx.stockMovement.findUnique({
      where: { id: importMovementId },
      select: { id: true },
    });
    let allMovements = await tx.stockMovement.findMany({
      where: { productId: product.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, stockAfter: true },
    });

    if (!existingImport && allMovements.length === 0) {
      const openingQty = roundQty(Math.max(0, product.stockQty));
      if (openingQty > 0) {
        const stockAfter = nextStockQty(0, openingQty, product.trackStock);
        await tx.stockMovement.create({
          data: {
            id: importMovementId,
            barbershopId: shopId,
            productId: product.id,
            type: "IMPORT",
            quantity: openingQty,
            unitCost: product.averageCost,
            stockBefore: 0,
            stockAfter,
            sourceType: "initial_stock",
            sourceId: product.id,
            reason: "Estoque inicial fictício do showcase",
            createdById: ownerId,
            createdAt: importDate,
          },
        });
        await tx.product.update({
          where: { id: product.id },
          data: { stockQty: stockAfter },
        });
        movementCount += 1;
        allMovements = [{ id: importMovementId, stockAfter }];
      }
    } else if (existingImport) {
      // Replay: a entrada histórica é reutilizada sem update.
      movementCount += 1;
    }

    const productSales = sales
      .filter((entry) => entry.line.productId === product.id)
      .sort((left, right) => left.sale.soldAt.getTime() - right.sale.soldAt.getTime());

    for (const entry of productSales) {
      const saleMovementId = financialUuid(
        DEMO_FINANCIAL_NAMESPACES.stockMovement,
        `stock-sale:${business.id}:${entry.sale.id}:${product.id}`,
      );
      const existingSaleMovement = await tx.stockMovement.findFirst({
        where: {
          OR: [
            { id: saleMovementId },
            {
              barbershopId: shopId,
              productId: product.id,
              sourceType: "retail_sale",
              sourceId: entry.sale.id,
            },
          ],
        },
        select: { id: true },
      });
      if (existingSaleMovement) {
        movementCount += 1;
        continue;
      }

      const chain = await tx.stockMovement.findMany({
        where: { productId: product.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { stockAfter: true },
      });
      const stockBefore = chain.at(-1)?.stockAfter ?? product.stockQty;
      if (stockBefore < entry.line.quantity) {
        throw new AppError(
          `Estoque insuficiente para ${product.name}: disponível ${stockBefore}, necessário ${entry.line.quantity}`,
          409,
          undefined,
          "INSUFFICIENT_STOCK",
        );
      }
      const stockAfter = nextStockQty(stockBefore, -entry.line.quantity, product.trackStock);

      await tx.stockMovement.create({
        data: {
          id: saleMovementId,
          barbershopId: shopId,
          productId: product.id,
          type: "SALE",
          quantity: -entry.line.quantity,
          unitCost: entry.line.unitCost,
          stockBefore,
          stockAfter,
          // Source type canônico do InventoryEngine.
          sourceType: "retail_sale",
          sourceId: entry.sale.id,
          reason: "Baixa por venda de varejo",
          createdById: ownerId,
          createdAt: entry.sale.soldAt,
        },
      });
      await tx.product.update({
        where: { id: product.id },
        data: { stockQty: stockAfter },
      });
      movementCount += 1;
    }

    // O seed de densidade pode ter restaurado o saldo inicial. A última
    // posição da cadeia canônica reconcilia o saldo sem recalcular baixas.
    const finalChain = await tx.stockMovement.findMany({
      where: { productId: product.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { stockAfter: true },
      take: 1,
    });
    if (finalChain[0]) {
      const canonicalStock = finalChain[0].stockAfter;
      // Não execute um update sem mudança: ele ainda alteraria `updatedAt` do
      // produto e tornaria o refresh semanticamente não-preservador.
      if (roundQty(product.stockQty) !== roundQty(canonicalStock)) {
        await tx.product.update({
          where: { id: product.id },
          data: { stockQty: canonicalStock },
        });
      }
    }
  }

  return movementCount;
}

async function lockFiado(tx: Tx, shopId: string, fiadoId: string): Promise<LockedFiado | null> {
  const rows = await tx.$queryRaw<LockedFiado[]>`
    SELECT
      id,
      "originalAmount",
      "paidAmount",
      "creditAdjustedAmount",
      status
    FROM fiados
    WHERE id = ${fiadoId}::uuid
      AND "barbershopId" = ${shopId}::uuid
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/**
 * Garante um único pagamento parcial do fixture. O fiado fica travado durante
 * toda a operação e o saldo é recalculado a partir das linhas existentes.
 */
async function ensureDemoFiadoPayment(input: {
  tx: Tx;
  business: DemoShowcaseManifestBusiness;
  shopId: string;
  ownerId: string;
  fiadoId: string;
  crmEventId: string;
  sale: DemoRetailSale;
  clientId: string;
  now: Date;
  intendedPaidAt: Date;
}): Promise<{ paymentId: string | null; count: number }> {
  const { tx, business, shopId, ownerId, fiadoId, crmEventId, sale, clientId, now, intendedPaidAt } =
    input;
  const locked = await lockFiado(tx, shopId, fiadoId);
  if (!locked) return { paymentId: null, count: 0 };

  const fiadoPaymentId = financialUuid(
    DEMO_FINANCIAL_NAMESPACES.fiadoPayment,
    `fiado-payment:${business.id}:${saoPauloCivilDate(sale.soldAt).slice(0, 7)}:${sale.idempotencyKey.split("-").at(-1) ?? sale.id}`,
  );
  let payment = await tx.fiadoPayment.findUnique({ where: { id: fiadoPaymentId } });
  const terminal = locked.status === "PAID" || locked.status === "FORGIVEN";

  if (!payment && !terminal) {
    const originalAmount = round2(Number(locked.originalAmount));
    const paidAmount = round2(Number(locked.paidAmount));
    const creditAdjustedAmount = round2(Number(locked.creditAdjustedAmount ?? 0));
    const remaining = round2(Math.max(0, originalAmount - paidAmount - creditAdjustedAmount));
    const requestedAmount = round2(Math.min(originalAmount * 0.4, remaining));

    if (remaining > 0) {
      if (sale.soldAt.getTime() > now.getTime()) {
        throw new AppError(
          "Não é possível registrar pagamento de uma venda ainda não ocorrida",
          409,
        );
      }
      const paidAt = clampAtNow(
        new Date(Math.max(sale.soldAt.getTime(), intendedPaidAt.getTime())),
        now,
      );
      payment = await tx.fiadoPayment.create({
        data: {
          id: fiadoPaymentId,
          fiadoId,
          amount: requestedAmount,
          paymentMethod: "pix",
          notes: "Recebimento parcial fictício.",
          registeredById: ownerId,
          createdAt: paidAt,
        },
      });
    }
  }

  if (payment) {
    await recordLedgerEntry(tx as unknown as LedgerClient, {
      barbershopId: shopId,
      kind: "FIADO_PAYMENT",
      amount: payment.amount,
      paymentMethod: payment.paymentMethod ?? "pix",
      sourceType: "FIADO_PAYMENT",
      sourceId: payment.id,
      relatedSourceId: fiadoId,
      occurredAt: payment.createdAt,
      professionalId: ownerId,
      clientId,
      createdBy: ownerId,
      description: "Recebimento de fiado",
    });

    await recordDemoCrmFinancialEvent(tx, {
      id: crmEventId,
      barbershopId: shopId,
      clientId,
      kind: "FIADO_PAYMENT",
      sourceType: "fiado_payment",
      sourceId: payment.id,
      grossAmount: 0,
      receivedAmount: payment.amount,
      outstandingDelta: -payment.amount,
      occurredAt: payment.createdAt,
      metadata: { fixture: true },
    });
  }

  if (!terminal) {
    const paymentTotal = await tx.fiadoPayment.aggregate({
      where: { fiadoId },
      _sum: { amount: true },
    });
    const newPaid = round2(Number(paymentTotal._sum.amount ?? 0));
    const originalAmount = round2(Number(locked.originalAmount));
    const creditAdjustedAmount = round2(Number(locked.creditAdjustedAmount ?? 0));
    const remaining = round2(Math.max(0, originalAmount - newPaid - creditAdjustedAmount));
    const nextStatus = remaining <= 0 ? "PAID" : newPaid > 0 ? "PARTIAL" : "PENDING";

    const previousPaid = round2(Number(locked.paidAmount));
    if (newPaid !== previousPaid || nextStatus !== locked.status) {
      await tx.fiado.update({
        where: { id: fiadoId },
        data: {
          paidAmount: newPaid,
          status: nextStatus,
          updatedById: ownerId,
        },
      });
    }
  }

  return { paymentId: payment?.id ?? null, count: payment ? 1 : 0 };
}

/**
 * Popula venda de varejo, estoque, fiado, CRM financeiro, convites de avaliação,
 * pagamentos fictícios e fechamento diário. Todos os IDs são determinísticos e
 * todas as operações são idempotentes na mesma data.
 */
export async function seedDemoShowcaseFinancial(
  tx: Tx,
  input: DemoFinancialInput,
): Promise<DemoFinancialSummary> {
  const { business, shopId, ownerId, staff, clients, products, today, now } = input;
  const summary: DemoFinancialSummary = {
    retailSaleCount: 0,
    retailLineCount: 0,
    stockMovementCount: 0,
    fiadoCount: 0,
    fiadoPaymentCount: 0,
    crmFinancialEventCount: 0,
    reviewInvitationCount: 0,
    paymentCount: 0,
    dailyCloseoutCount: 0,
  };

  // RLS local à mesma transação: todas as leituras/travas seguintes enxergam
  // somente a barbearia comandada.
  await tx.$executeRaw`SELECT set_config('app.current_barbershop_id', ${shopId}, TRUE)`;

  // ── Estoque canônico e vendas de varejo ───────────────────────────────────
  const lockedProducts = await lockDemoProducts(
    tx,
    shopId,
    products.map((product) => product.id),
  );
  const sellableInputProducts = products.filter((product) => {
    const authoritative = lockedProducts.get(product.id);
    return authoritative ? isSellableDemoProduct(authoritative) : false;
  });

  const saleEntries: DemoSaleEntry[] = [];
  if (sellableInputProducts.length > 0 && staff.length > 0 && clients.length > 0) {
    for (const monthKey of monthKeys(today)) {
      for (let index = 0; index < 4; index += 1) {
        const productInput = sellableInputProducts[
          (monthKey.charCodeAt(monthKey.length - 1) + index) % sellableInputProducts.length
        ];
        const product = lockedProducts.get(productInput.id);
        if (!product) continue;

        const client = clients[(monthKey.charCodeAt(5) + index * 7) % clients.length];
        const soldBy = staff[index % staff.length];
        const quantity = index % 3 === 0 ? 2 : 1;
        const paymentMethod = index === 3 ? "fiado" : ["pix", "cash", "credit_card"][index % 3];
        const day = saleDay(monthKey, index, today);
        const soldAt = clampAtNow(
          civilDateMinutesToUtc(
            day,
            10 * 60 + index * 47 + (monthKey.charCodeAt(5) % 25),
          ),
          now,
        );

        const entry = await ensureDemoRetailSale(tx, {
          business,
          shopId,
          ownerId,
          clientId: client.id,
          soldById: soldBy.id,
          product,
          quantity,
          paymentMethod,
          soldAt,
          monthKey,
          index,
        });
        saleEntries.push(entry);
        summary.retailSaleCount += 1;
        summary.retailLineCount += 1;

        await recordLedgerEntry(tx as unknown as LedgerClient, {
          barbershopId: shopId,
          kind: "PRODUCT_SALE",
          amount: entry.sale.total,
          paymentMethod: entry.sale.paymentMethod,
          sourceType: "RETAIL_SALE",
          sourceId: entry.sale.id,
          occurredAt: entry.sale.soldAt,
          professionalId: entry.sale.soldById,
          clientId: entry.sale.clientId,
          createdBy: ownerId,
          description: `Venda de ${entry.line.productName}`,
        });

        if (entry.sale.clientId) {
          const isFiado = canonicalPaymentMethod(entry.sale.paymentMethod) === "FIADO";
          await recordDemoCrmFinancialEvent(tx, {
            id: financialUuid(
              DEMO_FINANCIAL_NAMESPACES.crmEvent,
              `crm-product:${business.id}:${entry.sale.idempotencyKey.replace(`demo-${business.id}-`, "")}`,
            ),
            barbershopId: shopId,
            clientId: entry.sale.clientId,
            kind: "PRODUCT_SOLD",
            sourceType: "retail_sale",
            sourceId: entry.sale.id,
            grossAmount: entry.sale.total,
            receivedAmount: isFiado ? 0 : entry.sale.total,
            outstandingDelta: isFiado ? entry.sale.total : 0,
            occurredAt: entry.sale.soldAt,
            metadata: { paymentMethod: entry.sale.paymentMethod, fixture: true },
          });
          summary.crmFinancialEventCount += 1;
        }
      }
    }
  }

  summary.stockMovementCount = await seedDemoInventory(tx, {
    business,
    shopId,
    ownerId,
    products: new Map(
      [...lockedProducts.entries()].filter(([, product]) => isSellableDemoProduct(product)),
    ),
    sales: saleEntries,
  });

  // ── Fiado de varejo + pagamento parcial ───────────────────────────────────
  const currentMonth = today.slice(0, 7);
  for (const [entryIndex, entry] of saleEntries.entries()) {
    if (canonicalPaymentMethod(entry.sale.paymentMethod) !== "FIADO" || !entry.sale.clientId) {
      continue;
    }

    const client = clients.find((item) => item.id === entry.sale.clientId);
    const fixtureSuffix = entry.sale.idempotencyKey.replace(`demo-${business.id}-`, "");
    const fiadoId = financialUuid(
      DEMO_FINANCIAL_NAMESPACES.fiado,
      `fiado-retail:${business.id}:${fixtureSuffix}`,
    );
    const fiado = await tx.fiado.upsert({
      where: { retailSaleId: entry.sale.id },
      create: {
        id: fiadoId,
        barbershopId: shopId,
        customerName: client?.name ?? "Cliente",
        whatsapp: client?.whatsapp ?? "",
        clientId: entry.sale.clientId,
        description: `Venda de ${entry.line.productName}`,
        originalAmount: entry.sale.total,
        paidAmount: 0,
        status: "PENDING",
        dueDate: civilDateToUtcDate(addDaysToCivilDate(entry.saleDay, 15)),
        notes: "Fiado fictício gerado pelo showcase.",
        createdById: ownerId,
        origin: "RETAIL_SALE",
        retailSaleId: entry.sale.id,
        createdAt: entry.sale.soldAt,
      },
      // Principalmente status/valores terminais não podem ser reescritos.
      update: {},
    });
    summary.fiadoCount += 1;

    if (entry.saleDay.slice(0, 7) === currentMonth) {
      const intendedPaidAt = civilDateMinutesToUtc(today, 16 * 60 + entryIndex * 5);
      const payment = await ensureDemoFiadoPayment({
        tx,
        business,
        shopId,
        ownerId,
        fiadoId: fiado.id,
        crmEventId: financialUuid(
          DEMO_FINANCIAL_NAMESPACES.crmEvent,
          `crm-fiado-payment:${business.id}:${fixtureSuffix}`,
        ),
        sale: entry.sale,
        clientId: entry.sale.clientId,
        now,
        intendedPaidAt,
      });
      summary.fiadoPaymentCount += payment.count;
      summary.crmFinancialEventCount += payment.count;
    }
  }

  // ── CRM de serviços concluídos + um fiado de atendimento ──────────────────
  const completedAppointments = await tx.appointment.findMany({
    where: {
      barbershopId: shopId,
      status: "COMPLETED",
      clientId: { not: null },
      completedAt: { not: null },
    },
    select: {
      id: true,
      clientId: true,
      clientPackageId: true,
      serviceId: true,
      finalPrice: true,
      paymentMethod: true,
      completedAt: true,
    },
    orderBy: { completedAt: "asc" },
  });

  // Somente um fixture dedicado, já concluído e pago como fiado. Um
  // atendimento em dinheiro nunca é convertido em fiado.
  const serviceFiado = completedAppointments.find(
    (appointment) =>
      appointment.paymentMethod === "fiado" &&
      appointment.clientPackageId === null &&
      appointment.clientId !== null &&
      appointment.finalPrice !== null &&
      appointment.finalPrice > 0 &&
      appointment.completedAt !== null,
  );

  if (
    serviceFiado?.clientId &&
    serviceFiado.finalPrice !== null &&
    serviceFiado.finalPrice > 0 &&
    serviceFiado.completedAt
  ) {
    const serviceFiadoId = financialUuid(
      DEMO_FINANCIAL_NAMESPACES.fiado,
      `fiado-service:${business.id}:${serviceFiado.id}`,
    );
    const clientFromInput = clients.find((item) => item.id === serviceFiado.clientId);
    const clientFromDb = await tx.salonClient.findFirst({
      where: { id: serviceFiado.clientId, barbershopId: shopId },
      select: { name: true, whatsapp: true },
    });
    const serviceFiadoRecord = await tx.fiado.upsert({
      where: { id: serviceFiadoId },
      create: {
        id: serviceFiadoId,
        barbershopId: shopId,
        customerName: clientFromInput?.name ?? clientFromDb?.name ?? "Cliente",
        whatsapp: clientFromInput?.whatsapp ?? clientFromDb?.whatsapp ?? "",
        clientId: serviceFiado.clientId,
        description: "Atendimento concluído pago em fiado",
        originalAmount: serviceFiado.finalPrice,
        paidAmount: 0,
        status: "PENDING",
        dueDate: civilDateToUtcDate(addDaysToCivilDate(today, 10)),
        notes: "Fiado de atendimento fictício.",
        createdById: ownerId,
        origin: "SERVICE_COMPLETION",
        createdAt: serviceFiado.completedAt,
      },
      update: {},
    });
    summary.fiadoCount += 1;

    await recordDemoCrmFinancialEvent(tx, {
      id: financialUuid(
        DEMO_FINANCIAL_NAMESPACES.crmEvent,
        `crm-fiado-created:${business.id}:${serviceFiado.id}`,
      ),
      barbershopId: shopId,
      clientId: serviceFiado.clientId,
      kind: "FIADO_CREATED",
      sourceType: "fiado",
      sourceId: serviceFiadoRecord.id,
      grossAmount: serviceFiado.finalPrice,
      receivedAmount: 0,
      outstandingDelta: serviceFiado.finalPrice,
      occurredAt: serviceFiado.completedAt,
      metadata: { origin: "SERVICE_COMPLETION", fixture: true },
    });
    summary.crmFinancialEventCount += 1;
  }

  const completedQueueItems = await tx.queueItem.findMany({
    where: {
      barbershopId: shopId,
      status: "COMPLETED",
      clientId: { not: null },
      completedAt: { not: null },
    },
    select: {
      id: true,
      clientId: true,
      serviceId: true,
      finalPrice: true,
      paymentMethod: true,
      completedAt: true,
      appointmentId: true,
      appointment: { select: { clientPackageId: true } },
    },
    orderBy: { completedAt: "asc" },
  });
  const queueAppointmentIds = new Set(
    completedQueueItems
      .map((item) => item.appointmentId)
      .filter((id): id is string => Boolean(id)),
  );

  for (const queueItem of completedQueueItems) {
    if (!queueItem.clientId || !queueItem.completedAt) continue;
    // Sessão coberta por pacote não gera evento financeiro de serviço.
    if (queueItem.appointment?.clientPackageId) continue;

    const amount = queueItem.finalPrice ?? 0;
    const isFiado = canonicalPaymentMethod(queueItem.paymentMethod) === "FIADO";
    await recordDemoCrmFinancialEvent(tx, {
      id: financialUuid(
        DEMO_FINANCIAL_NAMESPACES.crmEvent,
        `crm-queue:${business.id}:${queueItem.id}`,
      ),
      barbershopId: shopId,
      clientId: queueItem.clientId,
      kind: "SERVICE_COMPLETED",
      sourceType: "queue",
      sourceId: queueItem.id,
      grossAmount: amount,
      receivedAmount: isFiado ? 0 : amount,
      outstandingDelta: isFiado ? amount : 0,
      occurredAt: queueItem.completedAt,
      metadata: { serviceId: queueItem.serviceId, fixture: true },
    });
    summary.crmFinancialEventCount += 1;
  }

  for (const appointment of completedAppointments) {
    if (!appointment.clientId || !appointment.completedAt) continue;
    if (appointment.clientPackageId) continue;
    // Um item de fila vinculado já representa o atendimento. Não criar um
    // segundo evento de agenda para a mesma sessão.
    if (queueAppointmentIds.has(appointment.id)) continue;

    const amount = appointment.finalPrice ?? 0;
    const isFiado = appointment.paymentMethod === "fiado";
    await recordDemoCrmFinancialEvent(tx, {
      id: financialUuid(
        DEMO_FINANCIAL_NAMESPACES.crmEvent,
        `crm-service:${business.id}:${appointment.id}`,
      ),
      barbershopId: shopId,
      clientId: appointment.clientId,
      kind: "SERVICE_COMPLETED",
      sourceType: "appointment",
      sourceId: appointment.id,
      grossAmount: amount,
      receivedAmount: isFiado ? 0 : amount,
      outstandingDelta: isFiado ? amount : 0,
      occurredAt: appointment.completedAt,
      metadata: { serviceId: appointment.serviceId, fixture: true },
    });
    summary.crmFinancialEventCount += 1;
  }

  const clientPackages = await tx.clientPackage.findMany({
    where: { barbershopId: shopId },
    select: { id: true, clientId: true, pricePaid: true, purchasedAt: true },
  });
  for (const clientPackage of clientPackages) {
    await recordDemoCrmFinancialEvent(tx, {
      id: financialUuid(
        DEMO_FINANCIAL_NAMESPACES.crmEvent,
        `crm-package:${business.id}:${clientPackage.id}`,
      ),
      barbershopId: shopId,
      clientId: clientPackage.clientId,
      kind: "PACKAGE_SOLD",
      sourceType: "client_package",
      sourceId: clientPackage.id,
      grossAmount: clientPackage.pricePaid,
      receivedAmount: clientPackage.pricePaid,
      outstandingDelta: 0,
      occurredAt: clientPackage.purchasedAt,
      metadata: { fixture: true },
    });
    summary.crmFinancialEventCount += 1;
  }

  // ── Convites de avaliação (somente dados, sem disparo externo) ───────────
  const segmentConfig = getSegmentConfig(business.segmento);
  if (!segmentConfig.advertisingRestricted && completedAppointments.length > 0) {
    const appointmentIds = completedAppointments
      .map((appointment) => appointment.id)
      .filter((id): id is string => Boolean(id));
    const existingReviews = await tx.clientReview.findMany({
      where: {
        barbershopId: shopId,
        appointmentId: { in: appointmentIds },
      },
      select: { appointmentId: true },
    });
    const reviewedAppointmentIds = new Set(
      existingReviews
        .map((review) => review.appointmentId)
        .filter((id): id is string => Boolean(id)),
    );
    const reviewCandidates = completedAppointments
      .filter(
        (appointment) =>
          appointment.completedAt !== null &&
          appointment.clientId !== null &&
          appointment.completedAt.getTime() <= now.getTime() &&
          now.getTime() - appointment.completedAt.getTime() <=
            REVIEW_CANDIDATE_AGE_DAYS * 86_400_000 &&
          !reviewedAppointmentIds.has(appointment.id),
      )
      .slice(-12);

    for (const appointment of reviewCandidates) {
      if (!appointment.clientId || !appointment.completedAt) continue;

      // Serializa convites concorrentes da mesma agenda.
      await tx.$queryRaw`
        SELECT id
        FROM appointments
        WHERE id = ${appointment.id}::uuid
          AND "barbershopId" = ${shopId}::uuid
        FOR UPDATE
      `;
      const existingInvitation = await tx.reviewInvitation.findFirst({
        where: {
          barbershopId: shopId,
          appointmentId: appointment.id,
        },
        select: { id: true },
      });
      if (existingInvitation) {
        // Replay: reutiliza a convite e não mexe em SENT/OPENED/SUBMITTED/etc.
        summary.reviewInvitationCount += 1;
        continue;
      }

      const invitationId = financialUuid(
        DEMO_FINANCIAL_NAMESPACES.reviewInvitation,
        `review-invitation:${business.id}:${appointment.id}`,
      );
      const token = randomBytes(REVIEW_TOKEN_BYTES).toString("base64url");
      const createdAt = new Date(now.getTime());
      await tx.reviewInvitation.create({
        data: {
          id: invitationId,
          barbershopId: shopId,
          appointmentId: appointment.id,
          clientId: appointment.clientId,
          tokenHash: hashReviewToken(token),
          status: "PENDING",
          sentAt: null,
          openedAt: null,
          submittedAt: null,
          revokedAt: null,
          expiresAt: new Date(createdAt.getTime() + REVIEW_EXPIRY_DAYS * 86_400_000),
          createdAt,
        },
      });
      summary.reviewInvitationCount += 1;
    }
  }

  // ── Pagamentos fictícios coerentes (sem chamada/ webhook real) ─────────────
  const paymentCandidates = completedAppointments.filter(
    (appointment) =>
      appointment.clientId !== null &&
      appointment.completedAt !== null &&
      appointment.clientPackageId === null &&
      (appointment.paymentMethod === "pix" || appointment.paymentMethod === "credit_card"),
  ).slice(-8);
  for (const [index, appointment] of paymentCandidates.entries()) {
    if (!appointment.clientId || !appointment.completedAt) continue;
    const amount = appointment.finalPrice ?? 0;
    const paymentId = financialUuid(
      DEMO_FINANCIAL_NAMESPACES.payment,
      `payment:${business.id}:${appointment.id}`,
    );
    const providerSnapshot = {
      demo: true,
      fixture: "showcase",
      appointmentId: appointment.id,
      index,
    };
    await tx.payment.upsert({
      where: { id: paymentId },
      create: {
        id: paymentId,
        provider: "ASAAS",
        // Sem identificador remoto: sync/refund não conseguem chamar o Asaas.
        providerPaymentId: null,
        status: "approved",
        statusDetail: "demo_fixture_approved",
        paymentMethod: appointment.paymentMethod === "pix" ? "pix" : "credit_card",
        transactionAmount: amount,
        currency: "BRL",
        description: "Pagamento fictício de atendimento do showcase",
        barbershopId: shopId,
        serviceId: appointment.serviceId,
        appointmentId: appointment.id,
        externalReference: `demo-showcase:${business.id}:${appointment.id}`,
        providerSnapshot,
        createdAt: appointment.completedAt,
      },
      // Approved/refunded/cancelled são estados terminais do fixture e nunca
      // são resetados. O provedor remoto permanece nulo desde a criação para
      // impedir qualquer sincronização/refund real.
      update: {},
    });
    summary.paymentCount += 1;
  }

  // ── Fechamento diário do último dia aberto ────────────────────────────────
  const shop = await tx.barbershop.findFirst({
    where: { id: shopId },
    select: { timezone: true },
  });
  const timezone = shop?.timezone || DEFAULT_SHOP_TIMEZONE;
  const localToday = shopDateKey(now, timezone);
  const closeoutDate = previousOpenDate(business, localToday);
  const { start: closeoutStart, end: closeoutEnd } = shopDayRange(closeoutDate, timezone);

  const [movements, fiados, commissions] = await Promise.all([
    tx.cashMovement.findMany({
      where: {
        barbershopId: shopId,
        occurredAt: { gte: closeoutStart, lte: closeoutEnd },
      },
    }),
    tx.fiado.findMany({
      where: {
        barbershopId: shopId,
        createdAt: { gte: closeoutStart, lte: closeoutEnd },
      },
      select: { originalAmount: true },
    }),
    tx.commissionEntry.aggregate({
      where: {
        barbershopId: shopId,
        createdAt: { gte: closeoutStart, lte: closeoutEnd },
      },
      _sum: { amount: true },
    }),
  ]);
  const ledgerRows = movements as LedgerRow[];
  const cashByMethod = summarizeCashByMethod(ledgerRows);
  const revenue = summarizeRevenue(ledgerRows);
  const closeoutId = financialUuid(
    DEMO_FINANCIAL_NAMESPACES.dailyCloseout,
    `closeout:${business.id}:${closeoutDate}`,
  );
  await tx.dailyCloseout.upsert({
    where: {
      barbershopId_date: {
        barbershopId: shopId,
        date: civilDateToUtcDate(closeoutDate),
      },
    },
    create: {
      id: closeoutId,
      barbershopId: shopId,
      date: civilDateToUtcDate(closeoutDate),
      balanceOpen: new Prisma.Decimal(0),
      cashReceived: new Prisma.Decimal(round2(cashByMethod.CASH ?? 0)),
      pixReceived: new Prisma.Decimal(round2(cashByMethod.PIX ?? 0)),
      cardReceived: new Prisma.Decimal(
        round2((cashByMethod.CREDIT_CARD ?? 0) + (cashByMethod.DEBIT_CARD ?? 0)),
      ),
      fiadoCreated: new Prisma.Decimal(
        round2(
          fiados.reduce((sum, row) => sum + Number(row.originalAmount), 0),
        ),
      ),
      fiadoPaid: new Prisma.Decimal(round2(sumLedger(ledgerRows, ["FIADO_PAYMENT"]))),
      expenses: new Prisma.Decimal(round2(sumLedger(ledgerRows, ["EXPENSE"]))),
      commissions: new Prisma.Decimal(round2(commissions._sum.amount ?? 0)),
      productSales: new Prisma.Decimal(round2(revenue.products)),
      cashMovementCount: movements.length,
      // Não existe caixa contado declarado neste fixture.
      discrepancy: null,
      notes: "Fechamento fictício do showcase de demonstração",
      closedBy: ownerId,
      closedAt: now,
    },
    // Replay não recalcula nem substitui um fechamento já salvo.
    update: {},
  });
  summary.dailyCloseoutCount += 1;

  return summary;
}
