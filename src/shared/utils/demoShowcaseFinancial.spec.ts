import { describe, expect, it, vi } from "vitest";
import type { BusinessSegment } from "@prisma/client";
import type { DemoShowcaseManifestBusiness } from "./demoShowcaseAssets";
import {
  seedDemoShowcaseFinancial,
  type DemoFinancialInput,
} from "./demoShowcaseFinancial";

type Row = Record<string, unknown>;

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_ID = "33333333-3333-4333-8333-333333333333";
const STAFF_ID = "44444444-4444-4444-8444-444444444444";
const PRODUCT_ID = "55555555-5555-4555-8555-555555555555";
const APPOINTMENT_FIADO_ID = "66666666-6666-4666-8666-666666666666";
const APPOINTMENT_PIX_ID = "77777777-7777-4777-8777-777777777777";

const business: DemoShowcaseManifestBusiness = {
  id: "barbearia",
  segmento: "BARBERSHOP" as BusinessSegment,
  pasta: "barbearia",
  logo: "logo.png",
  banner: "banner.png",
  confirmar: true,
  extras: [],
};

function normalizeWhere(where: Row | undefined): Row {
  if (!where) return {};
  const compositeKey = Object.keys(where).find(key =>
    key.includes("_") && where[key] && typeof where[key] === "object",
  );
  if (compositeKey) {
    return normalizeWhere(where[compositeKey] as Row);
  }
  return where;
}

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (value instanceof Date && condition instanceof Date) {
    return value.getTime() === condition.getTime();
  }
  if (condition === null || typeof condition !== "object") return value === condition;
  const filters = condition as Row;
  if ("in" in filters) {
    const values = filters.in as unknown[];
    return values.includes(value);
  }
  if ("not" in filters) {
    return filters.not === null ? value !== null : value !== filters.not;
  }
  if ("gte" in filters) {
    const left = value instanceof Date ? value.getTime() : Number(value);
    const right = filters.gte instanceof Date ? filters.gte.getTime() : Number(filters.gte);
    return left >= right;
  }
  if ("lte" in filters) {
    const left = value instanceof Date ? value.getTime() : Number(value);
    const right = filters.lte instanceof Date ? filters.lte.getTime() : Number(filters.lte);
    return left <= right;
  }
  return false;
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") {
      return (condition as Row[]).some(candidate => matches(row, candidate));
    }
    return matchesCondition(row[key], condition);
  });
}

function compare(left: unknown, right: unknown): number {
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  return String(left).localeCompare(String(right));
}

function sortRows(rows: Row[], orderBy: Row | Row[] | undefined): Row[] {
  if (!orderBy) return rows;
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((left, right) => {
    for (const order of orders) {
      for (const [field, direction] of Object.entries(order)) {
        const result = compare(left[field], right[field]);
        if (result !== 0) return direction === "desc" ? -result : result;
      }
    }
    return 0;
  });
}

class FakeCollection {
  readonly rows: Row[] = [];

  constructor(
    private readonly keyOf: (row: Row) => string | null = row =>
      typeof row.id === "string" ? row.id : null,
  ) {}

  async findFirst(args: Row = {}): Promise<Row | null> {
    return (
      this.rows.find(row => matches(row, normalizeWhere(args.where as Row | undefined))) ?? null
    );
  }

  async findUnique(args: Row = {}): Promise<Row | null> {
    return this.findFirst(args);
  }

  async findMany(args: Row = {}): Promise<Row[]> {
    const rows = this.rows.filter(row =>
      matches(row, normalizeWhere(args.where as Row | undefined)),
    );
    return sortRows(rows, args.orderBy as Row | Row[] | undefined);
  }

  async create(args: Row = {}): Promise<Row> {
    const data = { ...(args.data as Row) };
    if (!data.id) data.id = `fake-${this.rows.length + 1}`;
    this.rows.push(data);
    return data;
  }

  async upsert(args: Row = {}): Promise<Row> {
    const where = normalizeWhere(args.where as Row | undefined);
    const existing = this.rows.find(row => matches(row, where));
    if (existing) return existing;
    const data = { ...(args.create as Row) };
    if (!data.id) data.id = `fake-${this.rows.length + 1}`;
    this.rows.push(data);
    return data;
  }

  async update(args: Row = {}): Promise<Row> {
    const where = normalizeWhere(args.where as Row | undefined);
    const row = this.rows.find(item => matches(item, where));
    if (!row) throw new Error(`FakeCollection.update: registro não encontrado ${JSON.stringify(where)}`);
    Object.assign(row, args.data as Row);
    return row;
  }

  async aggregate(args: Row = {}): Promise<{ _sum: Record<string, unknown> }> {
    const rows = this.rows.filter(row =>
      matches(row, normalizeWhere(args.where as Row | undefined)),
    );
    const sumField = Object.keys((args._sum as Row) ?? {})[0];
    if (!sumField) return { _sum: {} };
    const total = rows.reduce((sum, row) => {
      const value = row[sumField];
      if (value === null || value === undefined) return sum;
      return sum + Number(value);
    }, 0);
    return { _sum: { [sumField]: total } };
  }

  keyFor(row: Row): string | null {
    return this.keyOf(row);
  }
}

function decimalValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return value;
}

function stableRow(row: Row): Row {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : decimalValue(value),
    ]),
  );
  return Object.fromEntries(
    Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function buildFakeTransaction() {
  const collections = {
    crmFinancialEvent: new FakeCollection(),
    retailSale: new FakeCollection(),
    retailSaleLine: new FakeCollection(),
    stockMovement: new FakeCollection(),
    product: new FakeCollection(),
    fiado: new FakeCollection(),
    fiadoPayment: new FakeCollection(),
    appointment: new FakeCollection(),
    queueItem: new FakeCollection(),
    salonClient: new FakeCollection(),
    clientPackage: new FakeCollection(),
    clientReview: new FakeCollection(),
    reviewInvitation: new FakeCollection(),
    payment: new FakeCollection(),
    barbershop: new FakeCollection(),
    cashMovement: new FakeCollection(),
    commissionEntry: new FakeCollection(),
    dailyCloseout: new FakeCollection(),
  };

  collections.product.rows.push({
    id: PRODUCT_ID,
    barbershopId: SHOP_ID,
    name: "Pomada matte",
    active: true,
    type: "RETAIL",
    trackStock: true,
    stockQty: 100,
    salePrice: 25,
    averageCost: 15,
  });
  collections.barbershop.rows.push({
    id: SHOP_ID,
    timezone: "America/Sao_Paulo",
  });
  collections.salonClient.rows.push({
    id: CLIENT_ID,
    barbershopId: SHOP_ID,
    name: "Cliente Demo",
    whatsapp: "5511999999999",
  });

  const completedAppointments = [
    {
      id: APPOINTMENT_FIADO_ID,
      clientId: CLIENT_ID,
      clientPackageId: null,
      serviceId: "88888888-8888-4888-8888-888888888888",
      finalPrice: 55,
      paymentMethod: "fiado",
      completedAt: new Date("2026-11-19T13:00:00.000Z"),
    },
    {
      id: APPOINTMENT_PIX_ID,
      clientId: CLIENT_ID,
      clientPackageId: null,
      serviceId: "99999999-9999-4999-8999-999999999999",
      finalPrice: 45,
      paymentMethod: "pix",
      completedAt: new Date("2026-11-19T14:00:00.000Z"),
    },
  ];

  const tx = {
    ...collections,
    $executeRaw: vi.fn(async () => 0),
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?").replace(/\s+/gu, " ").trim();
      if (sql.includes("FROM products")) {
        return collections.product.rows
          .filter(row => row.id === values[0])
          .map(row => ({ id: row.id }));
      }
      if (sql.includes("FROM fiados")) {
        const row = collections.fiado.rows.find(item => item.id === values[0]);
        return row
          ? [
              {
                id: row.id,
                originalAmount: row.originalAmount,
                paidAmount: row.paidAmount,
                creditAdjustedAmount: row.creditAdjustedAmount ?? 0,
                status: row.status,
              },
            ]
          : [];
      }
      if (sql.includes("FROM appointments")) {
        return [{ id: values[0] }];
      }
      return [];
    }),
  };

  collections.appointment.findMany = vi.fn(async () => completedAppointments);
  collections.queueItem.findMany = vi.fn(async () => []);
  collections.clientPackage.findMany = vi.fn(async () => []);
  collections.clientReview.findMany = vi.fn(async () => []);
  collections.commissionEntry.aggregate = vi.fn(async () => ({ _sum: { amount: 0 } }));

  return { tx, collections };
}

function financialInput(): DemoFinancialInput {
  return {
    business,
    shopId: SHOP_ID,
    ownerId: OWNER_ID,
    staff: [{ id: STAFF_ID, name: "Barbeiro Demo" }],
    clients: [{ id: CLIENT_ID, name: "Cliente Demo", whatsapp: "5511999999999" }],
    products: [
      {
        id: PRODUCT_ID,
        name: "Pomada matte",
        salePrice: 25,
        averageCost: 15,
        initialStock: 100,
      },
    ],
    today: "2026-11-20",
    now: new Date("2026-11-20T12:00:00.000Z"),
  };
}

function stateSnapshot(collections: ReturnType<typeof buildFakeTransaction>["collections"]) {
  return Object.fromEntries(
    Object.entries(collections).map(([name, collection]) => [
      name,
      collection.rows
        .map(stableRow)
        .sort((left, right) =>
          JSON.stringify(left).localeCompare(JSON.stringify(right)),
        ),
    ]),
  );
}

describe("demoShowcaseFinancial — idempotência financeira", () => {
  it("replay não duplica venda, estoque, ledger, Fiado, CRM, pagamento ou fechamento", async () => {
    const { tx, collections } = buildFakeTransaction();

    const first = await seedDemoShowcaseFinancial(tx as never, financialInput());
    const firstState = stateSnapshot(collections);
    const second = await seedDemoShowcaseFinancial(tx as never, financialInput());
    const secondState = stateSnapshot(collections);

    expect(second).toEqual(first);
    expect(secondState).toEqual(firstState);

    expect(collections.retailSale.rows).toHaveLength(12);
    expect(collections.retailSaleLine.rows).toHaveLength(12);
    expect(collections.stockMovement.rows).toHaveLength(13);
    expect(collections.fiado.rows).toHaveLength(4);
    expect(collections.fiadoPayment.rows).toHaveLength(1);
    expect(collections.crmFinancialEvent.rows).toHaveLength(16);
    expect(collections.reviewInvitation.rows).toHaveLength(2);
    expect(collections.payment.rows).toHaveLength(1);
    expect(collections.dailyCloseout.rows).toHaveLength(1);

    const ledgerKeys = collections.cashMovement.rows.map(
      row => row.idempotencyKey as string,
    );
    expect(new Set(ledgerKeys).size).toBe(ledgerKeys.length);
    expect(
      collections.cashMovement.rows.filter(row => row.type === "PRODUCT_SALE"),
    ).toHaveLength(12);
    expect(
      collections.cashMovement.rows.filter(row => row.type === "FIADO_PAYMENT"),
    ).toHaveLength(1);

    const stockTime = (value: unknown): number =>
      value instanceof Date ? value.getTime() : Date.parse(String(value));
    const stockChain = collections.stockMovement.rows
      .slice()
      .sort((left, right) => stockTime(left.createdAt) - stockTime(right.createdAt));
    expect(stockChain[0]?.stockBefore).toBe(0);
    for (let index = 1; index < stockChain.length; index += 1) {
      expect(stockChain[index]?.stockBefore).toBe(
        stockChain[index - 1]?.stockAfter,
      );
    }

    const payment = collections.payment.rows[0];
    expect(payment?.status).toBe("approved");
    expect(payment?.providerPaymentId).toBeNull();
  });

  it("mantém pagamentos terminais e estados de estoque sem mutá-los no replay", async () => {
    const { tx, collections } = buildFakeTransaction();
    await seedDemoShowcaseFinancial(tx as never, financialInput());

    const terminalPayment = stableRow(collections.payment.rows[0]);
    const terminalStock = collections.stockMovement.rows.map(stableRow);
    const terminalFiado = collections.fiado.rows.map(stableRow);
    const terminalCloseout = stableRow(collections.dailyCloseout.rows[0]);

    await seedDemoShowcaseFinancial(tx as never, financialInput());

    expect(stableRow(collections.payment.rows[0])).toEqual(terminalPayment);
    expect(collections.stockMovement.rows.map(stableRow)).toEqual(terminalStock);
    expect(collections.fiado.rows.map(stableRow)).toEqual(terminalFiado);
    expect(stableRow(collections.dailyCloseout.rows[0])).toEqual(terminalCloseout);
  });
});
