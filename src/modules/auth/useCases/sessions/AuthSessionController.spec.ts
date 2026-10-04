/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthSessionController } from "./AuthSessionController";
import { revokeSessionRow } from "../../services/userSessionService";

const prismaMock = vi.hoisted(() => ({
  userSession: { findMany: vi.fn(), findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

vi.mock("../../services/userSessionService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/userSessionService")>();
  return { ...actual, revokeSessionRow: vi.fn() };
});

const controller = new AuthSessionController();

function makeReply() {
  return { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis(), setCookie: vi.fn() };
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    body: {},
    ip: "9.9.9.9",
    user: { id: "user-1", role: "OWNER" },
    ...overrides,
  } as never;
}

const sessionRow = {
  id: "sid-a",
  userId: "user-1",
  deviceLabel: "Chrome em Windows",
  ipAddress: "2.2.2.2",
  userAgent: "Mozilla/5.0",
  createdAt: new Date("2026-10-01T10:00:00.000Z"),
  lastSeenAt: new Date("2026-10-04T09:00:00.000Z"),
  expiresAt: new Date(Date.now() + 86_400_000),
  revokedAt: null,
  revokedReason: null,
  refreshTokenId: "rt-a",
  rememberedTokenId: "rm-a",
};

describe("AuthSessionController.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lista apenas sessões do próprio usuário e marca a atual", async () => {
    prismaMock.userSession.findMany.mockResolvedValue([sessionRow]);
    const reply = makeReply();

    await controller.list(
      makeRequest({ user: { id: "user-1", role: "OWNER", sid: "sid-a" } }),
      reply as never,
    );

    expect(prismaMock.userSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
    const sent = vi.mocked(reply.send).mock.calls[0][0] as { data: Array<Record<string, unknown>> };
    expect(sent.data[0]).toMatchObject({ id: "sid-a", status: "active", current: true });
  });
});

describe("AuthSessionController.revoke", () => {
  beforeEach(() => vi.clearAllMocks());

  it("404 quando a sessão não existe", async () => {
    prismaMock.userSession.findUnique.mockResolvedValue(null);
    await expect(
      controller.revoke(makeRequest({ params: { id: "sid-x" } }), makeReply() as never),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("404 quando a sessão pertence a outro usuário (não vaza existence)", async () => {
    prismaMock.userSession.findUnique.mockResolvedValue({ ...sessionRow, id: "sid-b", userId: "user-2" });
    await expect(
      controller.revoke(
        makeRequest({ params: { id: "sid-b" }, user: { id: "user-1", role: "OWNER" } }),
        makeReply() as never,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("400 ao encerrar a sessão atual sem confirmSelf", async () => {
    prismaMock.userSession.findUnique.mockResolvedValue(sessionRow);
    await expect(
      controller.revoke(
        makeRequest({
          params: { id: "sid-a" },
          user: { id: "user-1", role: "OWNER", sid: "sid-a" },
        }),
        makeReply() as never,
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "CONFIRM_SELF_REQUIRED" });
  });

  it("encerra outra sessão, audita e NÃO limpa cookies", async () => {
    prismaMock.userSession.findUnique.mockResolvedValue({ ...sessionRow, id: "sid-b" });
    prismaMock.auditLog.create.mockResolvedValue({});
    vi.mocked(revokeSessionRow).mockResolvedValue(undefined);
    const reply = makeReply();

    await controller.revoke(
      makeRequest({
        params: { id: "sid-b" },
        body: { reason: "celular perdido no transporte" },
        user: { id: "user-1", role: "OWNER", sid: "sid-a" },
      }),
      reply as never,
    );

    expect(revokeSessionRow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sid-b" }),
      expect.objectContaining({ reason: "celular perdido no transporte" }),
    );
    expect(reply.setCookie).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revoked: true, current: false }) }),
    );
  });

  it("encerrar a sessão atual com confirmSelf limpa os cookies de refresh", async () => {
    prismaMock.userSession.findUnique.mockResolvedValue(sessionRow);
    prismaMock.auditLog.create.mockResolvedValue({});
    vi.mocked(revokeSessionRow).mockResolvedValue(undefined);
    const reply = makeReply();

    await controller.revoke(
      makeRequest({
        params: { id: "sid-a" },
        body: { confirmSelf: true },
        user: { id: "user-1", role: "OWNER", sid: "sid-a" },
      }),
      reply as never,
    );

    expect(reply.setCookie).toHaveBeenCalledTimes(2);
    expect(reply.setCookie).toHaveBeenCalledWith("refresh_token", "", expect.anything());
    expect(reply.setCookie).toHaveBeenCalledWith("saved_refresh_user-1", "", expect.anything());
  });
});
