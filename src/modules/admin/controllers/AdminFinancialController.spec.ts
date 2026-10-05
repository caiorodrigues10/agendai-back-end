/// <reference types="vitest/globals" />
import { prisma } from "@/libs/prismaClient";
import { AdminFinancialController } from "./AdminFinancialController";

type Row = Record<string, any>;

const db: { barbershops: Row[]; expenses: Row[]; fiados: Row[] } = {
  barbershops: [],
  expenses: [],
  fiados: [],
};

const consultas: string[] = [];

function igual(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as any).getTime() === new Date(b as any).getTime();
  }
  return a === b;
}

/** Matching mínimo para os WHEREs usados pelos dois caminhos. */
function casa(row: Row, where?: Row): boolean {
  for (const [chave, cond] of Object.entries(where ?? {})) {
    if (cond === undefined) continue;
    if (cond === null) {
      if (row[chave] != null) return false;
      continue;
    }
    const valor = row[chave];
    if (typeof cond === "object" && !(cond instanceof Date)) {
      if ("in" in cond && !(cond.in as unknown[]).some((v) => igual(v, valor))) return false;
      if ("lt" in cond && !(valor instanceof Date && valor < (cond.lt as Date))) return false;
      if ("gte" in cond && !(valor instanceof Date && valor >= (cond.gte as Date))) return false;
      continue;
    }
    if (!igual(valor, cond)) return false;
  }
  return true;
}

function ordenar(rows: Row[], orderBy?: Row): Row[] {
  if (!orderBy) return rows;
  const [campo, dir] = Object.entries(orderBy)[0] as [string, "asc" | "desc"];
  return [...rows].sort((a, b) => {
    const x = a[campo] instanceof Date ? a[campo].getTime() : a[campo];
    const y = b[campo] instanceof Date ? b[campo].getTime() : b[campo];
    return dir === "asc" ? (x > y ? 1 : -1) : x < y ? 1 : -1;
  });
}

function fiadosDe(where: Row): Row[] {
  const ids = typeof where.barbershopId === "object" ? where.barbershopId.in : [where.barbershopId];
  return db.fiados.filter((row) => ids.includes(row.barbershopId) && casa(row, where));
}

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    barbershop: {
      findMany: async (args: Row) => {
        consultas.push("barbershop.findMany");
        const rows = ordenar(
          db.barbershops.filter((row) => casa(row, args.where)),
          args.orderBy
        );
        return rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? rows.length));
      },
      count: async (args: Row) => {
        consultas.push("barbershop.count");
        return db.barbershops.filter((row) => casa(row, args.where)).length;
      },
    },
    expense: {
      groupBy: async (args: Row) => {
        consultas.push("expense.groupBy");
        const grupos = new Map<string, Row[]>();
        for (const row of db.expenses) {
          if (!casa(row, args.where)) continue;
          const lista = grupos.get(row.barbershopId);
          if (lista) lista.push(row);
          else grupos.set(row.barbershopId, [row]);
        }
        return [...grupos.entries()].map(([barbershopId, linhas]) => ({
          barbershopId,
          _sum: { amount: linhas.reduce((s, r) => s + r.amount, 0) },
          _count: { _all: linhas.length },
        }));
      },
      aggregate: async (args: Row) => {
        consultas.push("expense.aggregate");
        const linhas = db.expenses.filter((row) => casa(row, args.where));
        return {
          _sum: { amount: linhas.reduce((s, r) => s + r.amount, 0) || null },
          _count: { id: linhas.length },
        };
      },
    },
    fiado: {
      findMany: async (args: Row) => {
        consultas.push("fiado.findMany");
        return fiadosDe(args.where).map((row) => {
          const saida: Row = {};
          for (const campo of Object.keys(args.select ?? {})) saida[campo] = row[campo];
          return saida;
        });
      },
      count: async (args: Row) => {
        consultas.push("fiado.count");
        return fiadosDe(args.where).length;
      },
    },
  },
}));

const AGORA = new Date("2026-10-01T02:00:00.000Z");

function montarBanco() {
  const shop = (id: string, name: string, createdAt: string, active = true): Row => ({
    id,
    name,
    whatsapp: `55119${id.length}0000`,
    active,
    approvalStatus: "APPROVED",
    createdAt: new Date(createdAt),
    timezone: "America/Sao_Paulo",
    organizationId: null,
  });

  db.barbershops = [
    shop("s1", "Zeta Corte", "2026-01-01T00:00:00Z"),
    shop("s2", "Alfa Barba", "2026-02-01T00:00:00Z"),
    shop("s3", "Mid Navalha", "2026-03-01T00:00:00Z"),
    shop("s4", "Nilo Tesoura", "2026-04-01T00:00:00Z"),
    shop("s5", "Vazio Lab", "2026-05-01T00:00:00Z"),
    shop("s6", "Fechado Loja", "2026-06-01T00:00:00Z", false),
  ];

  db.expenses = [
    { id: "e1", barbershopId: "s1", amount: 100, inventoryReceiptId: null },
    // Compra de estoque: fora dos dois caminhos (`inventoryReceiptId: null`).
    { id: "e2", barbershopId: "s1", amount: 50, inventoryReceiptId: "inv-1" },
    { id: "e3", barbershopId: "s1", amount: 20, inventoryReceiptId: null },
    { id: "e4", barbershopId: "s2", amount: 30, inventoryReceiptId: null },
    { id: "e5", barbershopId: "s3", amount: 700, inventoryReceiptId: null },
  ];

  db.fiados = [
    { id: "f1", barbershopId: "s1", status: "PENDING", originalAmount: 200, paidAmount: 50, creditAdjustedAmount: null, dueDate: new Date("2026-09-01T00:00:00Z") },
    { id: "f2", barbershopId: "s1", status: "PARTIAL", originalAmount: 100, paidAmount: 100, creditAdjustedAmount: null, dueDate: new Date("2026-12-01T00:00:00Z") },
    { id: "f3", barbershopId: "s1", status: "PENDING", originalAmount: 300, paidAmount: 0, creditAdjustedAmount: 25, dueDate: new Date("2026-10-15T00:00:00Z") },
    { id: "f4", barbershopId: "s2", status: "PENDING", originalAmount: 40, paidAmount: 0, creditAdjustedAmount: null, dueDate: null },
    // Quitado: fora do `status in [PENDING, PARTIAL]` dos dois caminhos.
    { id: "f5", barbershopId: "s2", status: "PAID", originalAmount: 50, paidAmount: 50, creditAdjustedAmount: null, dueDate: new Date("2026-08-01T00:00:00Z") },
    { id: "f6", barbershopId: "s3", status: "PENDING", originalAmount: 90, paidAmount: 10, creditAdjustedAmount: null, dueDate: new Date("2026-09-30T00:00:00Z") },
  ];
}

type Query = { page?: string; limit?: string; sort?: string };

async function responder(query: Query): Promise<Row> {
  const reply = { send: (payload: Row) => payload } as any;
  const request = { query } as any;
  return new AdminFinancialController().byBarbershop(request, reply);
}

/** Caminho ANTIGO (antes do B15): 3 consultas POR salão dentro de `Promise.all`. */
async function byBarbershopAntigo(query: Query): Promise<Row> {
  const { page = "1", limit = "20", sort = "debt" } = query;
  const skip = (Number(page) - 1) * Number(limit);
  const take = Math.min(Number(limit), 100);

  const barbershops = await prisma.barbershop.findMany({
    where: { active: true },
    skip,
    take,
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, whatsapp: true, active: true, approvalStatus: true, createdAt: true },
  });
  const total = await prisma.barbershop.count({ where: { active: true } });

  const enriched = await Promise.all(
    barbershops.map(async (shop: any) => {
      const [expenseAgg, fiadoAgg, overdueCount] = await Promise.all([
        prisma.expense.aggregate({
          where: { barbershopId: shop.id, inventoryReceiptId: null },
          _sum: { amount: true },
          _count: { id: true },
        }),
        prisma.fiado.findMany({
          where: { barbershopId: shop.id, status: { in: ["PENDING", "PARTIAL"] } },
          select: { originalAmount: true, paidAmount: true, creditAdjustedAmount: true, dueDate: true },
        }),
        prisma.fiado.count({
          where: { barbershopId: shop.id, status: { in: ["PENDING", "PARTIAL"] }, dueDate: { lt: new Date() } },
        }),
      ]);

      const totalDebt = fiadoAgg.reduce(
        (s: number, f: any) => s + Math.max(0, f.originalAmount - f.paidAmount - (f.creditAdjustedAmount ?? 0)),
        0
      );

      return {
        id: shop.id,
        name: shop.name,
        whatsapp: shop.whatsapp,
        active: shop.active,
        approvalStatus: shop.approvalStatus,
        createdAt: shop.createdAt,
        expenses: { total: expenseAgg._sum.amount ?? 0, count: expenseAgg._count.id ?? 0 },
        fiados: { activeCount: fiadoAgg.length, totalDebt, overdueCount },
      };
    })
  );

  if (sort === "debt") enriched.sort((a: any, b: any) => b.fiados.totalDebt - a.fiados.totalDebt);
  else if (sort === "expenses") enriched.sort((a: any, b: any) => b.expenses.total - a.expenses.total);

  return {
    data: enriched,
    meta: { total, page: Number(page), limit: take, totalPages: Math.ceil(total / take) },
  };
}

async function equivalente(query: Query): Promise<{ antigo: Row; novo: Row }> {
  consultas.length = 0;
  const antigo = await byBarbershopAntigo(query);
  consultas.length = 0;
  const novo = await responder(query);
  return { antigo, novo: { data: novo.data, meta: novo.meta } };
}

beforeEach(() => {
  montarBanco();
  consultas.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AdminFinancialController.byBarbershop — equivalência com o caminho antigo", () => {
  it("mesmos números por salão (despesas, fiados, vencidos) e mesmo payload", async () => {
    const { antigo, novo } = await equivalente({});
    expect(novo).toEqual(antigo);
    expect(novo.data).toHaveLength(5);
  });

  it("ordena por dívida total desc e o corte de estoque/fiado quitado não conta", async () => {
    const { novo } = await equivalente({ sort: "debt" });
    const porId = new Map(novo.data.map((row: Row) => [row.id, row]));
    expect(porId.get("s1")).toMatchObject({
      expenses: { total: 120, count: 2 },
      fiados: { activeCount: 3, totalDebt: 425, overdueCount: 1 },
    });
    expect(porId.get("s2")).toMatchObject({
      expenses: { total: 30, count: 1 },
      fiados: { activeCount: 1, totalDebt: 40, overdueCount: 0 },
    });
    expect(porId.get("s3")).toMatchObject({
      expenses: { total: 700, count: 1 },
      fiados: { activeCount: 1, totalDebt: 80, overdueCount: 1 },
    });
    expect(porId.get("s4")).toMatchObject({ expenses: { total: 0, count: 0 }, fiados: { activeCount: 0, totalDebt: 0, overdueCount: 0 } });
    expect(porId.get("s5")).toMatchObject({ expenses: { total: 0, count: 0 }, fiados: { activeCount: 0, totalDebt: 0, overdueCount: 0 } });
    expect(novo.data.map((row: Row) => row.id)).toEqual(["s1", "s3", "s2", "s5", "s4"]);
    expect(novo.meta).toEqual({ total: 5, page: 1, limit: 20, totalPages: 1 });
  });

  it("sort=expenses reproduce a mesma ordenação do caminho antigo", async () => {
    const { antigo, novo } = await equivalente({ sort: "expenses" });
    expect(novo).toEqual(antigo);
    expect(novo.data.map((row: Row) => row.id)).toEqual(["s3", "s1", "s2", "s5", "s4"]);
  });

  it("paginação (page/limit) entrega o mesmo recorte nos dois caminhos", async () => {
    const { antigo, novo } = await equivalente({ page: "2", limit: "2" });
    expect(novo).toEqual(antigo);
    expect(novo.data.map((row: Row) => row.id)).toEqual(["s3", "s2"]);
    expect(novo.meta).toEqual({ total: 5, page: 2, limit: 2, totalPages: 3 });
  });
});

describe("AdminFinancialController.byBarbershop — queries por request (meta B15 ≤ 10)", () => {
  it("5 salões: 4 consultas no caminho novo (antes: 17 = 2 + 3×5)", async () => {
    await responder({});
    expect(consultas).toHaveLength(4);
    expect(consultas.filter((nome) => nome === "expense.aggregate")).toHaveLength(0);

    consultas.length = 0;
    await byBarbershopAntigo({});
    expect(consultas.length).toBe(17);
  });

  it("página vazia não emite o lote de agregação", async () => {
    await responder({ page: "9" });
    expect(consultas).toEqual(["barbershop.findMany", "barbershop.count"]);
  });
});
