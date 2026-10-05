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
});
