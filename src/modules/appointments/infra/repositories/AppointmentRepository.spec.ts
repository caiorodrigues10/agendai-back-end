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
});
