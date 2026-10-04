import { describe, it, expect, beforeEach, vi } from "vitest";
import { Readable } from "node:stream";
import { AdminAuditLogController } from "./AdminAuditLogController";

const prismaMock = vi.hoisted(() => ({
  auditLog: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
  barbershop: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  accessLog: { findMany: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
  Prisma: { TransactionClient: class {} },
}));

const controller = new AdminAuditLogController();

function makeReply() {
  return {
    status: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

function makeRequest(query: Record<string, unknown> = {}) {
  return { query, user: { id: "master-1", role: "MASTER_ADMIN" } } as never;
}

const baseLog = {
  id: "log-1",
  userId: "u1",
  action: "PATCH",
  resource: "products",
  resourceId: null,
  details: null,
  ipAddress: "1.2.3.4",
  createdAt: new Date("2026-10-03T10:00:00.000Z"),
};

describe("AdminAuditLogController.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filtra por shopId via resourceId ou uuid na action", async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([]);
    prismaMock.auditLog.count.mockResolvedValue(0);

    const reply = makeReply();
    await controller.list(makeRequest({ shopId: "11111111-1111-4111-8111-111111111111" }), reply as never);

    const args = prismaMock.auditLog.findMany.mock.calls[0][0] as {
      where: { OR: Array<Record<string, unknown>> };
    };
    expect(args.where.OR).toHaveLength(2);
    expect(args.where.OR[0]).toEqual({
      resourceId: "11111111-1111-4111-8111-111111111111",
    });
    expect(args.where.OR[1]).toEqual({
      action: { contains: "11111111-1111-4111-8111-111111111111" },
    });
  });

  it("combina busca e shopId no mesmo OR", async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([]);
    prismaMock.auditLog.count.mockResolvedValue(0);

    const reply = makeReply();
    await controller.list(
      makeRequest({ shopId: "11111111-1111-4111-8111-111111111111", search: "suspend" }),
      reply as never,
    );

    const args = prismaMock.auditLog.findMany.mock.calls[0][0] as {
      where: { OR: Array<Record<string, unknown>> };
    };
    expect(args.where.OR).toHaveLength(5);
  });
});

describe("AdminAuditLogController.export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("envia CSV em stream sem teto de registros", async () => {
    prismaMock.auditLog.findMany.mockResolvedValueOnce([baseLog]);

    const reply = makeReply();
    await controller.export(makeRequest(), reply as never);

    expect(reply.header).toHaveBeenCalledWith("Content-Type", "text/csv; charset=utf-8");
    const stream = vi.mocked(reply.send).mock.calls[0][0] as Readable;
    expect(stream).toBeInstanceOf(Readable);

    let csv = "";
    for await (const chunk of stream) csv += String(chunk);
    expect(csv.split("\r\n")[0]).toBe(
      "createdAt,action,resource,resourceId,userId,ipAddress,details",
    );
    expect(csv).toContain("2026-10-03T10:00:00.000Z,PATCH,products,,u1,1.2.3.4,");
    // Uma chamada só (lote < 1000 encerra o gerador).
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledTimes(1);
  });

  it("pagina por cursor até esgotar os registros", async () => {
    const fullBatch = Array.from({ length: 1000 }, (_, index) => ({
      ...baseLog,
      id: `log-${index}`,
    }));
    prismaMock.auditLog.findMany
      .mockResolvedValueOnce(fullBatch)
      .mockResolvedValueOnce([baseLog]);

    const reply = makeReply();
    await controller.export(makeRequest(), reply as never);

    const stream = vi.mocked(reply.send).mock.calls[0][0] as Readable;
    let bytes = 0;
    for await (const chunk of stream) bytes += String(chunk).length;

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledTimes(2);
    const secondCall = prismaMock.auditLog.findMany.mock.calls[1][0] as {
      cursor: { id: string };
      skip: number;
    };
    expect(secondCall.cursor.id).toBe("log-999");
    expect(secondCall.skip).toBe(1);
    expect(bytes).toBeGreaterThan(1000);
  });
});

describe("AdminAuditLogController.alerts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("agrupa ações sensíveis das últimas 24h e retorna os recentes", async () => {
    const now = Date.now();
    prismaMock.auditLog.findMany.mockResolvedValue([
      { ...baseLog, action: "ACCOUNT_IMPERSONATE", userId: "u1", createdAt: new Date(now - 1000) },
      { ...baseLog, action: "ACCOUNT_SUSPEND", userId: "u1", createdAt: new Date(now - 2000) },
      { ...baseLog, action: "DELETE /api/products/9", userId: "u2", createdAt: new Date(now - 3000) },
      { ...baseLog, action: "POST /api/products", userId: "u2" },
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u1", name: "Alice", email: "alice@x.com" },
      { id: "u2", name: "Bob", email: "bob@x.com" },
    ]);

    const reply = makeReply();
    await controller.alerts(makeRequest(), reply as never);

    const sent = vi.mocked(reply.send).mock.calls[0][0] as {
      data: {
        total: number;
        byGroup: Array<{ key: string; count: number }>;
        recent: Array<{ action: string; userName: string | null }>;
      };
    };
    expect(sent.data.total).toBe(3);
    const counts = Object.fromEntries(
      sent.data.byGroup.map((group) => [group.key, group.count]),
    );
    expect(counts).toMatchObject({
      impersonation: 1,
      accounts: 1,
      deletions: 1,
      blocks: 0,
      others: 0,
    });
    expect(sent.data.recent).toHaveLength(3);
    expect(sent.data.recent[0].userName).toBe("Alice");
  });
});

describe("AdminAuditLogController.facets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna recursos distintos, usuários com logs e salões ativos", async () => {
    prismaMock.auditLog.groupBy
      .mockResolvedValueOnce([{ resource: "products" }, { resource: "users" }])
      .mockResolvedValueOnce([{ userId: "u1" }, { userId: "u2" }]);
    prismaMock.barbershop.findMany.mockResolvedValue([
      { id: "b1", name: "Barbearia Central" },
    ]);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "u1", name: "Alice", email: "alice@x.com" },
      { id: "u2", name: "Bob", email: "bob@x.com" },
    ]);

    const reply = makeReply();
    await controller.facets(makeRequest(), reply as never);

    const sent = vi.mocked(reply.send).mock.calls[0][0] as {
      data: {
        resources: string[];
        users: Array<{ name: string }>;
        shops: Array<{ name: string }>;
      };
    };
    expect(sent.data.resources).toEqual(["products", "users"]);
    expect(sent.data.users.map((u) => u.name)).toEqual(["Alice", "Bob"]);
    expect(sent.data.shops).toEqual([{ id: "b1", name: "Barbearia Central" }]);
  });
});
