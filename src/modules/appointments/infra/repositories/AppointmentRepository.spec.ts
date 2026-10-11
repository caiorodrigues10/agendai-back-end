/// <reference types="vitest/globals" />

const findMany = vi.fn();
const count = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    appointment: {
      findMany: (...args: unknown[]) => findMany(...args),
      count: (...args: unknown[]) => count(...args),
    },
  },
}));

import { AppointmentRepository } from "./AppointmentRepository";

describe("AppointmentRepository.list", () => {
  let repo: AppointmentRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    repo = new AppointmentRepository();
  });

  it("desempata por id na paginação por data/hora", async () => {
    await repo.list("shop-1", { page: 3, limit: 25 });

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
      skip: number;
      take: number;
    };

    expect(args.orderBy).toEqual([{ date: "asc" }, { time: "asc" }, { id: "asc" }]);
    expect(args.skip).toBe(50);
    expect(args.take).toBe(25);
  });

  it("mantém findMany e count na mesma janela de paginação", async () => {
    await repo.list("shop-1", { page: 1, limit: 10, status: "CONFIRMED" });

    const listArgs = findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    const countArgs = count.mock.calls[0][0] as { where: Record<string, unknown> };

    expect(listArgs.where).toEqual({ barbershopId: "shop-1", status: "CONFIRMED" });
    expect(countArgs.where).toEqual(listArgs.where);
  });

  it("filtra por intervalo civil from/to em UTC (inclusive nas pontas)", async () => {
    await repo.list("shop-1", { page: 1, limit: 100, from: "2026-10-01", to: "2026-10-31" });

    const listArgs = findMany.mock.calls[0][0] as { where: { date: { gte: Date; lt: Date } } };
    expect(listArgs.where.date.gte).toEqual(new Date(Date.UTC(2026, 9, 1)));
    expect(listArgs.where.date.lt).toEqual(new Date(Date.UTC(2026, 10, 1)));
  });

  it("`date` específica tem precedência sobre from/to", async () => {
    await repo.list("shop-1", { page: 1, limit: 100, date: "2026-10-05", from: "2026-10-01", to: "2026-10-31" });

    const listArgs = findMany.mock.calls[0][0] as { where: { date: { gte: Date; lt: Date } } };
    expect(listArgs.where.date.gte).toEqual(new Date(Date.UTC(2026, 9, 5)));
    expect(listArgs.where.date.lt).toEqual(new Date(Date.UTC(2026, 9, 6)));
  });
});
