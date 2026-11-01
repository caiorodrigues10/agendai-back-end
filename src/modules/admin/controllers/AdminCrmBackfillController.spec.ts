import { describe, it, expect, beforeEach, vi } from "vitest";
import { AdminCrmBackfillController } from "./AdminCrmBackfillController";

const prismaMock = vi.hoisted(() => ({
  crmBackfillRun: { findMany: vi.fn(), count: vi.fn() },
  user: { findMany: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
  Prisma: { TransactionClient: class {} },
}));

const RUN_ID = "33333333-3333-4333-8333-333333333333";
const SHOP_ID = "11111111-1111-4111-8111-111111111111";

function makeReply() {
  return { status: vi.fn().mockReturnThis(), send: vi.fn() } as never;
}

function makeRequest(query: Record<string, unknown> = {}) {
  return { query, user: { id: "master-1", role: "MASTER_ADMIN" } };
}

describe("AdminCrmBackfillController", () => {
  let controller: AdminCrmBackfillController;

  beforeEach(() => {
    controller = new AdminCrmBackfillController();
    vi.clearAllMocks();
    prismaMock.crmBackfillRun.count.mockResolvedValue(1);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "master-1", name: "Master Admin", email: "master@agendai.app" },
    ]);
  });

  it("lista as execuções com salão, quem disparou e contadores", async () => {
    prismaMock.crmBackfillRun.findMany.mockResolvedValue([
      {
        id: RUN_ID,
        barbershopId: SHOP_ID,
        version: "crm-ledger-v1",
        status: "SUCCEEDED",
        scope: "GLOBAL",
        triggeredById: "master-1",
        linkedRecords: 12,
        createdEvents: 34,
        totalEvents: 56,
        error: null,
        startedAt: new Date("2026-11-01T10:00:00.000Z"),
        completedAt: new Date("2026-11-01T10:02:00.000Z"),
        barbershop: { name: "Barbearia Central" },
      },
    ]);

    const reply = makeReply();
    await controller.runs(makeRequest() as never, reply);

    const payload = (reply as unknown as { send: { mock: { calls: unknown[][] } } }).send.mock
      .calls[0][0] as {
      data: Array<{
        id: string;
        scope: string;
        barbershopName: string | null;
        triggeredBy: { id: string; name: string } | null;
        linkedRecords: number;
      }>;
      meta: { total: number; page: number; totalPages: number; runningGlobal: number };
    };

    expect(payload.data[0]).toMatchObject({
      id: RUN_ID,
      scope: "GLOBAL",
      barbershopName: "Barbearia Central",
      linkedRecords: 12,
    });
    expect(payload.data[0].triggeredBy?.name).toBe("Master Admin");
    expect(payload.meta.total).toBe(1);
    expect(payload.meta.runningGlobal).toBe(1);
  });

  it("filtra por status e escopo", async () => {
    prismaMock.crmBackfillRun.findMany.mockResolvedValue([]);

    await controller.runs(
      makeRequest({ status: "RUNNING", scope: "TENANT", page: "2", limit: "10" }) as never,
      makeReply(),
    );

    expect(prismaMock.crmBackfillRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "RUNNING", scope: "TENANT" },
        skip: 10,
        take: 10,
      }),
    );
    expect(prismaMock.crmBackfillRun.count).toHaveBeenCalledWith({
      where: { status: "RUNNING", scope: "GLOBAL" },
    });
  });

  it("rejeita filtro de status inválido", async () => {
    await expect(
      controller.runs(makeRequest({ status: "RODANDO" }) as never, makeReply()),
    ).rejects.toThrow();
    expect(prismaMock.crmBackfillRun.findMany).not.toHaveBeenCalled();
  });
});
