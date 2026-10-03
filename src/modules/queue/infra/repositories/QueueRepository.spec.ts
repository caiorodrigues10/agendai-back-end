/// <reference types="vitest/globals" />

const findMany = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    queueItem: { findMany: (...args: unknown[]) => findMany(...args) },
  },
}));

import { QueueRepository } from "./QueueRepository";

function makeItem(id: string, joinedAt: number, status = "WAITING") {
  return {
    id,
    barbershopId: "shop-1",
    serviceId: "service-1",
    customerId: "session-1",
    clientId: null,
    customerName: `Cliente ${id}`,
    whatsapp: "5511999999999",
    joinedAt: new Date(joinedAt),
    calledAt: null,
    status,
    estimatedStartAt: null,
    lastNotifiedPosition: null,
    addedByStaff: false,
    responsibleQueueItemId: null,
    responsibleQueueItem: null,
    completedAt: null,
    completedBy: null,
    finalPrice: null,
    paymentMethod: null,
    service: { name: "Corte", avgTimeMinutes: 30 },
  };
}

describe("QueueRepository.list", () => {
  let repo: QueueRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new QueueRepository();
  });

  it("limita a busca aos itens mais recentes e devolve em ordem asc por joinedAt", async () => {
    findMany.mockResolvedValue([
      makeItem("c", 3000, "COMPLETED"),
      makeItem("b", 2000, "WAITING"),
      makeItem("a", 1000, "COMPLETED"),
    ]);

    const result = await repo.list("shop-1", { statuses: ["WAITING", "COMPLETED"] });

    const args = findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, string>>;
      take: number;
      where: { status: { in: string[] } };
    };

    expect(args.orderBy).toEqual([{ joinedAt: "desc" }, { id: "desc" }]);
    expect(args.take).toBeGreaterThan(0);
    expect(args.take).toBeLessThanOrEqual(500);
    expect(args.where.status.in).toEqual(["WAITING", "COMPLETED"]);

    expect(result.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(result.map((item) => item.joinedAt)).toEqual([1000, 2000, 3000]);
  });

  it("mantém o padrão de status ativo quando nenhum é informado", async () => {
    findMany.mockResolvedValue([]);

    await repo.list("shop-1");

    const args = findMany.mock.calls[0][0] as { where: { status: { in: string[] }; barbershopId: string } };
    expect(args.where.status.in).toEqual(["WAITING", "IN_CHAIR"]);
    expect(args.where.barbershopId).toBe("shop-1");
  });

  it("preserva o shape do DTO ao limitar o retorno", async () => {
    findMany.mockResolvedValue([makeItem("a", 1000, "COMPLETED")]);

    const [item] = await repo.list("shop-1", { statuses: ["COMPLETED"] });

    expect(item).toMatchObject({
      id: "a",
      barbershopId: "shop-1",
      status: "completed",
      customerName: "Cliente a",
      serviceName: "Corte",
      serviceAvgTimeMinutes: 30,
      responsibleCustomerId: null,
    });
  });
});

describe("QueueRepository ordenação por slot da fila", () => {
  let repo: QueueRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new QueueRepository();
    findMany.mockResolvedValue([]);
  });

  it.each([
    ["findActiveInLine", () => repo.findActiveInLine("shop-1")],
    ["findWaitingByBarbershop", () => repo.findWaitingByBarbershop("shop-1")],
  ])("%s desempata por id", async (_name, run) => {
    await run();

    const args = findMany.mock.calls[0][0] as { orderBy: Array<Record<string, string>> };
    expect(args.orderBy).toEqual([{ joinedAt: "asc" }, { id: "asc" }]);
  });
});
