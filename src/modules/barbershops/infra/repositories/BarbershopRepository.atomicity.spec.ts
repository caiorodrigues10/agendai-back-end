/// <reference types="vitest/globals" />
/**
 * `updateSchedule` gravava deleteMany + createMany em `$transaction([…])`
 * (array-form) — com a extensão RLS, as duas escritas rodavam em conexões
 * separadas: dava para apagar a grade antiga sem gravar a nova.
 */
const rlsHolder = vi.hoisted(() => ({ tx: undefined as unknown }));
const rlsMock = vi.hoisted(() =>
  vi.fn(async (fn: (tx: unknown) => unknown) => fn(rlsHolder.tx)),
);
vi.mock("@/libs/prismaExtensions", () => ({ rlsTransaction: rlsMock }));

const prismaMock = vi.hoisted(() => ({
  schedule: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  barbershop: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

import { BarbershopRepository } from "./BarbershopRepository";

describe("BarbershopRepository.updateSchedule — atomicidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rlsHolder.tx = prismaMock;
    rlsMock.mockClear();
    prismaMock.schedule.deleteMany.mockResolvedValue({ count: 7 });
    prismaMock.schedule.createMany.mockResolvedValue({ count: 7 });
  });

  it("apaga a grade antiga e grava a nova na MESMA transação", async () => {
    const repo = new BarbershopRepository();

    await repo.updateSchedule("shop-1", [
      { dayOfWeek: 1, isOpen: true, openTime: "09:00", closeTime: "18:00" },
    ]);

    expect(rlsMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.schedule.deleteMany).toHaveBeenCalledWith({
      where: { barbershopId: "shop-1" },
    });
    expect(prismaMock.schedule.createMany).toHaveBeenCalledWith({
      data: [
        { barbershopId: "shop-1", dayOfWeek: 1, isOpen: true, openTime: "09:00", closeTime: "18:00" },
      ],
    });
  });
});
