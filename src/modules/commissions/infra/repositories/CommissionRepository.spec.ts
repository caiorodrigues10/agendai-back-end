/// <reference types="vitest/globals" />

const findMany = vi.fn();
const count = vi.fn();

vi.mock("@/libs/prismaClient", async () => {
  const { Prisma } = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    Prisma,
    prisma: {
      commissionEntry: {
        findMany: (...args: unknown[]) => findMany(...args),
        count: (...args: unknown[]) => count(...args),
      },
    },
  };
});

import { civilDayBounds } from "@/shared/utils/dateUtils";
import { CommissionRepository } from "./CommissionRepository";

const SP = "America/Sao_Paulo";

type Entry = {
  id: string;
  barbershopId: string;
  queueItemId: string | null;
  appointmentId: string | null;
  serviceId: string;
  professionalId: string;
  percentage: number;
  amount: number;
  createdAt: Date;
  service: { name: string; price: number };
  professional: { name: string };
  queueItem: { finalPrice: number } | null;
  appointment: { finalPrice: number } | null;
};

function entry(overrides: Partial<Entry>): Entry {
  return {
    id: "entry-1",
    barbershopId: "shop-1",
    queueItemId: "queue-1",
    appointmentId: null,
    serviceId: "service-1",
    professionalId: "pro-1",
    percentage: 40,
    amount: 20,
    createdAt: new Date("2026-10-05T12:00:00.000Z"),
    service: { name: "Corte", price: 50 },
    professional: { name: "Ana" },
    queueItem: { finalPrice: 50 },
    appointment: null,
    ...overrides,
  };
}

describe("CommissionRepository.list", () => {
  let repo: CommissionRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    repo = new CommissionRepository();
  });

  it("ordena por createdAt desc com id de desempate e pagina com skip/take", async () => {
    await repo.list("shop-1", { page: 2, limit: 10 });

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
      skip: number;
      take: number;
      where: Record<string, unknown>;
    };

    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
    expect(args.where).toEqual({ barbershopId: "shop-1" });
    // `total` vem do count com o MESMO where: é o conjunto filtrado inteiro,
    // não o tamanho da página.
    expect(count.mock.calls[0][0]).toEqual({ where: { barbershopId: "shop-1" } });
  });

  it("aplica a janela de período no findMany e no count com o mesmo where", async () => {
    await repo.list("shop-1", {
      page: 1,
      limit: 10,
      from: "2026-10-05",
      to: "2026-10-07",
      timeZone: SP,
    });

    const listWhere = (findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    const countWhere = (count.mock.calls[0][0] as { where: Record<string, unknown> }).where;

    expect(listWhere).toEqual({
      barbershopId: "shop-1",
      AND: [
        {
          createdAt: {
            gte: civilDayBounds("2026-10-05", SP).gte,
            lt: civilDayBounds("2026-10-07", SP).lt,
          },
        },
      ],
    });
    expect(countWhere).toEqual(listWhere);
  });

  it("filtros combinados: cada um vira uma cláusula em AND", async () => {
    await repo.list("shop-1", {
      page: 1,
      limit: 20,
      professionalId: "11111111-1111-1111-1111-111111111111",
      serviceId: "33333333-3333-3333-3333-333333333333",
      origin: "QUEUE",
      from: "2026-10-05",
      to: "2026-10-07",
      timeZone: SP,
    });

    const where = (findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where;
    expect(where).toEqual({
      barbershopId: "shop-1",
      AND: [
        { professionalId: "11111111-1111-1111-1111-111111111111" },
        { serviceId: "33333333-3333-3333-3333-333333333333" },
        { queueItemId: { not: null } },
        {
          createdAt: {
            gte: civilDayBounds("2026-10-05", SP).gte,
            lt: civilDayBounds("2026-10-07", SP).lt,
          },
        },
      ],
    });
  });

  it("sort=valor: ordena por amount com id de desempate", async () => {
    await repo.list("shop-1", {
      page: 1,
      limit: 20,
      sort: { field: "valor", dir: "asc" },
    });

    const orderBy = (findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, unknown>>;
    }).orderBy;
    expect(orderBy).toEqual([{ amount: "asc" }, { id: "asc" }]);
  });

  it("sort=data asc: ordena por createdAt com id de desempate", async () => {
    await repo.list("shop-1", {
      page: 1,
      limit: 20,
      sort: { field: "data", dir: "asc" },
    });

    const orderBy = (findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, unknown>>;
    }).orderBy;
    expect(orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
  });
});

describe("CommissionRepository.summary", () => {
  let repo: CommissionRepository;

  const entries: Entry[] = [
    entry({ id: "e1", queueItemId: "q1", professionalId: "p1", amount: 20 }),
    entry({
      id: "e2",
      queueItemId: "q2",
      professionalId: "p1",
      amount: 10,
      queueItem: { finalPrice: 60 },
    }),
    entry({
      id: "e3",
      queueItemId: null,
      appointmentId: "a1",
      professionalId: "p2",
      professional: { name: "Bia" },
      amount: 15,
      queueItem: null,
      appointment: { finalPrice: 100 },
    }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue(entries);
    repo = new CommissionRepository();
  });

  it("as somas cobrem TODO o conjunto filtrado: findMany sem skip/take/orderBy", async () => {
    const summary = await repo.summary("shop-1", {
      from: "2026-10-05",
      to: "2026-10-07",
      timeZone: SP,
    });

    const args = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();
    expect(args.orderBy).toBeUndefined();
    expect(args.where).toEqual({
      barbershopId: "shop-1",
      AND: [
        {
          createdAt: {
            gte: civilDayBounds("2026-10-05", SP).gte,
            lt: civilDayBounds("2026-10-07", SP).lt,
          },
        },
      ],
    });

    // 3 lançamentos (2 do p1 + 1 do p2), nenhum cortado por paginação.
    expect(summary.commissionTotal).toBe(45);
    expect(summary.byProfessional).toEqual([
      { professionalId: "p1", professionalName: "Ana", commissionTotal: 30, entryCount: 2 },
      { professionalId: "p2", professionalName: "Bia", commissionTotal: 15, entryCount: 1 },
    ]);
  });

  it("grossTotal soma o preço de origem de cada lançamento filtrado", async () => {
    const summary = await repo.summary("shop-1", {});

    // q1 (50) + q2 (60) + a1 (100)
    expect(summary.grossTotal).toBe(210);
    expect(summary.commissionTotal).toBe(45);
  });

  it("usa o mesmo where da listagem (profissional + serviço + salão)", async () => {
    await repo.summary("shop-1", {
      professionalId: "11111111-1111-1111-1111-111111111111",
      serviceId: "33333333-3333-3333-3333-333333333333",
    });

    const args = findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where).toEqual({
      barbershopId: "shop-1",
      AND: [
        { professionalId: "11111111-1111-1111-1111-111111111111" },
        { serviceId: "33333333-3333-3333-3333-333333333333" },
      ],
    });
  });

  it("conjunto vazio devolve zeros", async () => {
    findMany.mockResolvedValueOnce([]);

    const summary = await repo.summary("shop-1", {});

    expect(summary).toEqual({
      grossTotal: 0,
      commissionTotal: 0,
      byProfessional: [],
    });
  });
});
