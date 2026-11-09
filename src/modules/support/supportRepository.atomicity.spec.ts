/// <reference types="vitest/globals" />
/**
 * `reactivateOnReply` gravava o status do ticket e o histórico em
 * `$transaction([…])` (array-form) — com a extensão RLS, as duas escritas
 * rodavam em conexões separadas.
 */
const rlsHolder = vi.hoisted(() => ({ tx: undefined as unknown }));
const rlsMock = vi.hoisted(() =>
  vi.fn(async (fn: (tx: unknown) => unknown) => fn(rlsHolder.tx)),
);
vi.mock("@/libs/prismaExtensions", () => ({ rlsTransaction: rlsMock }));

const prismaMock = vi.hoisted(() => ({
  ticket: { update: vi.fn() },
  ticketHistory: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

import { SupportRepository } from "./supportRepository";

describe("SupportRepository.reactivateOnReply — atomicidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rlsHolder.tx = prismaMock;
    rlsMock.mockClear();
    prismaMock.ticket.update.mockResolvedValue({ id: "t-1", status: "IN_PROGRESS" });
    prismaMock.ticketHistory.create.mockResolvedValue({});
  });

  it("reativa o ticket e grava o histórico na MESMA transação", async () => {
    const repo = new SupportRepository();

    const result = await repo.reactivateOnReply("t-1", "WAITING_SHOP", "user-1");

    expect(rlsMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t-1" },
        data: { status: "IN_PROGRESS" },
      }),
    );
    expect(prismaMock.ticketHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: "t-1",
          oldValue: "WAITING_SHOP",
          newValue: "IN_PROGRESS",
        }),
      }),
    );
    expect(result).toEqual({ id: "t-1", status: "IN_PROGRESS" });
  });

  it("status ativo não faz nada", async () => {
    const repo = new SupportRepository();

    const result = await repo.reactivateOnReply("t-1", "OPEN", "user-1");

    expect(result).toBeNull();
    expect(rlsMock).not.toHaveBeenCalled();
    expect(prismaMock.ticket.update).not.toHaveBeenCalled();
  });
});
