/// <reference types="vitest/globals" />

const findMany = vi.fn();
const findUnique = vi.fn();
const count = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    salonClient: {
      findMany: (...args: unknown[]) => findMany(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
      count: (...args: unknown[]) => count(...args),
    },
  },
}));

import { SalonClientRepository } from "./SalonClientRepository";

describe("SalonClientRepository.list", () => {
  let repo: SalonClientRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    findUnique.mockResolvedValue(null);
    count.mockResolvedValue(0);
    repo = new SalonClientRepository();
  });

  it("desempata por id na ordenação por nome", async () => {
    await repo.list({ page: 2, limit: 20, barbershopId: "shop-1" });

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
      skip: number;
      take: number;
      where: Record<string, unknown>;
    };

    expect(args.orderBy).toEqual([{ name: "asc" }, { id: "asc" }]);
    expect(args.skip).toBe(20);
    expect(args.take).toBe(20);
    expect(args.where).toEqual({ barbershopId: "shop-1" });
    expect(count.mock.calls[0][0]).toEqual({ where: { barbershopId: "shop-1" } });
  });

  it("mantém determinístico o recorte de 50 agendamentos do detalhe", async () => {
    await repo.findById("client-1");

    const args = findUnique.mock.calls[0][0] as {
      include: { appointments: { orderBy: Array<Record<string, string>>; take: number } };
    };

    expect(args.include.appointments.take).toBe(50);
    expect(args.include.appointments.orderBy).toEqual([
      { date: "asc" },
      { time: "asc" },
      { id: "asc" },
    ]);
  });

  it("página além do total: devolve lista vazia e preserva o total real", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(42);

    const result = await repo.list({ page: 99, limit: 20, barbershopId: "shop-1" });

    const args = findMany.mock.calls[0][0] as { skip: number; take: number };
    expect(args.skip).toBe((99 - 1) * 20);
    expect(args.take).toBe(20);
    expect(result.data).toEqual([]);
    expect(result.total).toBe(42);
  });

  it("barbershopId do contexto é o único que chega ao where, junto com os filtros", async () => {
    await repo.list({
      page: 1,
      limit: 20,
      barbershopId: "shop-1",
      search: "ana",
      hasOpenFiado: true,
    });

    const args = findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(args.where.barbershopId).toBe("shop-1");
    expect(args.where).toMatchObject({
      barbershopId: "shop-1",
      AND: [
        { OR: [{ name: { contains: "ana", mode: "insensitive" } }] },
        { fiados: { some: { barbershopId: "shop-1", status: { in: ["PENDING", "PARTIAL"] } } } },
      ],
    });
  });

  it("count recebe o mesmo where do findMany", async () => {
    await repo.list({
      page: 1,
      limit: 20,
      barbershopId: "shop-1",
      hasActivePackage: true,
    });

    const findManyArgs = findMany.mock.calls[0][0] as { where: unknown };
    const countArgs = count.mock.calls[0][0] as { where: unknown };
    expect(countArgs.where).toEqual(findManyArgs.where);
  });

  it("a contagem de pacotes ativos usa a mesma regra do filtro (salão, status, sessões e validade)", async () => {
    await repo.list({ page: 1, limit: 20, barbershopId: "shop-1" });

    const args = findMany.mock.calls[0][0] as {
      include: {
        packages: {
          where: {
            barbershopId: string;
            status: string;
            remainingSessions: { gt: number };
            OR: Array<Record<string, unknown>>;
          };
        };
      };
    };

    const where = args.include.packages.where;
    expect(where.barbershopId).toBe("shop-1");
    expect(where.status).toBe("ACTIVE");
    expect(where.remainingSessions).toEqual({ gt: 0 });
    expect(where.OR).toEqual([
      { expiresAt: null },
      { expiresAt: { gt: expect.any(Date) } },
    ]);
  });
});
