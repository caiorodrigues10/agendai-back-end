/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AdminSessionController } from "./AdminSessionController";
import { revokeSessionRow, revokeAllSessionsForUser } from "@/modules/auth/services/userSessionService";

const prismaMock = vi.hoisted(() => ({
  userSession: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
  user: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

vi.mock("@/modules/auth/services/userSessionService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/auth/services/userSessionService")>();
  return { ...actual, revokeSessionRow: vi.fn(), revokeAllSessionsForUser: vi.fn() };
});

const controller = new AdminSessionController();

function makeReply() {
  return { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    query: {},
    params: {},
    body: {},
    ip: "1.2.3.4",
    user: { id: "master-1", role: "MASTER_ADMIN" },
    ...overrides,
  } as never;
}

const activeSession = {
  id: "sid-1",
  userId: "u2",
  barbershopId: null,
  deviceLabel: "Chrome em macOS",
  ipAddress: "1.1.1.1",
  userAgent: "Mozilla/5.0",
  createdAt: new Date("2026-10-04T08:00:00.000Z"),
  lastSeenAt: new Date("2026-10-04T09:00:00.000Z"),
  expiresAt: new Date(Date.now() + 86_400_000),
  revokedAt: null,
  revokedReason: null,
  refreshTokenId: "rt-1",
  rememberedTokenId: "rm-1",
  user: { id: "u2", name: "Dona Rosa", email: "rosa@x.com", role: "OWNER", active: true },
};

describe("AdminSessionController.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lista sessões reais com usuário, status e marcação da atual", async () => {
    prismaMock.userSession.findMany.mockResolvedValue([activeSession]);
    prismaMock.userSession.count.mockResolvedValue(1);

    const reply = makeReply();
    await controller.list(
      makeRequest({ user: { id: "master-1", role: "MASTER_ADMIN", sid: "sid-1" } }),
      reply as never,
    );

    const sent = vi.mocked(reply.send).mock.calls[0][0] as {
      data: Array<Record<string, unknown>>;
      meta: { total: number };
    };
    expect(sent.data).toHaveLength(1);
    expect(sent.data[0]).toMatchObject({
      id: "sid-1",
      userName: "Dona Rosa",
      userEmail: "rosa@x.com",
      userRole: "OWNER",
      status: "active",
      deviceLabel: "Chrome em macOS",
      current: true,
    });
    expect(sent.meta.total).toBe(1);
  });

  it("filtra por status=active (revokedAt nulo e não expirada)", async () => {
    prismaMock.userSession.findMany.mockResolvedValue([]);
    prismaMock.userSession.count.mockResolvedValue(0);

    await controller.list(makeRequest({ query: { status: "active" } }), makeReply() as never);

    expect(prismaMock.userSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null, expiresAt: { gt: expect.any(Date) } }),
      }),
    );
  });
});

describe("AdminSessionController.revoke", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404 quando a sessão não existe", async () => {
    prismaMock.userSession.findUnique.mockResolvedValue(null);
    const reply = makeReply();

    await expect(
      controller.revoke(
        makeRequest({ params: { id: "sid-x" }, body: { reason: "motivo longo o bastante" } }),
        reply as never,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("409 quando a sessão já estava encerrada", async () => {
    prismaMock.userSession.findUnique.mockResolvedValue({ ...activeSession, revokedAt: new Date() });
    const reply = makeReply();

    await expect(
      controller.revoke(
        makeRequest({ params: { id: "sid-1" }, body: { reason: "motivo longo o bastante" } }),
        reply as never,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("400 quando encerra a própria sessão atual sem confirmSelf", async () => {
    prismaMock.userSession.findUnique.mockResolvedValue({
      ...activeSession,
      userId: "master-1",
      user: { ...activeSession.user, id: "master-1", role: "MASTER_ADMIN" },
    });
    const reply = makeReply();

    await expect(
      controller.revoke(
        makeRequest({
          params: { id: "sid-1" },
          body: { reason: "motivo longo o bastante" },
          user: { id: "master-1", role: "MASTER_ADMIN", sid: "sid-1" },
        }),
        reply as never,
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "CONFIRM_SELF_REQUIRED" });
  });

  it("403 quando um admin sem permissão ALL tenta encerrar sessão de outro MASTER_ADMIN", async () => {
    prismaMock.userSession.findUnique.mockResolvedValue({
      ...activeSession,
      userId: "master-2",
      user: { ...activeSession.user, id: "master-2", role: "MASTER_ADMIN" },
    });
    const reply = makeReply();

    await expect(
      controller.revoke(
        makeRequest({
          params: { id: "sid-1" },
          body: { reason: "motivo longo o bastante" },
          user: { id: "master-1", role: "MASTER_ADMIN", permissions: ["internal:users:manage"] },
        }),
        reply as never,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("revoga com motivo, grava auditoria e devolve sucesso", async () => {
    prismaMock.userSession.findUnique.mockResolvedValue(activeSession);
    prismaMock.auditLog.create.mockResolvedValue({});
    vi.mocked(revokeSessionRow).mockResolvedValue(undefined);
    const reply = makeReply();

    await controller.revoke(
      makeRequest({
        params: { id: "sid-1" },
        body: { reason: "notebook roubado na barbearia" },
      }),
      reply as never,
    );

    expect(revokeSessionRow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sid-1" }),
      expect.objectContaining({ revokedById: "master-1", reason: "notebook roubado na barbearia" }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "SESSION_REVOKE", resourceId: "sid-1" }),
      }),
    );
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ revoked: true }) }),
    );
  });
});

describe("AdminSessionController.revokeAllForUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404 quando o usuário não existe", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(
      controller.revokeAllForUser(
        makeRequest({ params: { id: "22222222-2222-4222-8222-222222222222" }, body: { reason: "motivo longo o bastante" } }),
        makeReply() as never,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("400 quando o alvo é o próprio admin sem confirmSelf", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "master-1", role: "MASTER_ADMIN", name: "Mestre" });
    await expect(
      controller.revokeAllForUser(
        makeRequest({
          params: { id: "master-1" },
          body: { reason: "motivo longo o bastante" },
          user: { id: "master-1", role: "MASTER_ADMIN" },
        }),
        makeReply() as never,
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "CONFIRM_SELF_REQUIRED" });
  });

  it("403 para encerrar todas as sessões de outro MASTER_ADMIN sem ALL", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "master-2", role: "MASTER_ADMIN", name: "Outro" });
    await expect(
      controller.revokeAllForUser(
        makeRequest({
          params: { id: "master-2" },
          body: { reason: "motivo longo o bastante" },
          user: { id: "master-1", role: "MASTER_ADMIN", permissions: ["internal:users:manage"] },
        }),
        makeReply() as never,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("revoga tudo, audita e devolve contagens", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u2", role: "OWNER", name: "Dona Rosa" });
    prismaMock.auditLog.create.mockResolvedValue({});
    vi.mocked(revokeAllSessionsForUser).mockResolvedValue({ sessions: 2, tokens: 3 });
    const reply = makeReply();

    await controller.revokeAllForUser(
      makeRequest({
        params: { id: "u2" },
        body: { reason: "conta comprometida pelo cliente" },
      }),
      reply as never,
    );

    expect(revokeAllSessionsForUser).toHaveBeenCalledWith("u2", {
      revokedById: "master-1",
      reason: "conta comprometida pelo cliente",
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "USER_REVOKE_ALL_SESSIONS", resourceId: "u2" }),
      }),
    );
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { targetUserId: "u2", sessions: 2, tokens: 3 },
      }),
    );
  });
});
