/// <reference types="vitest/globals" />

const redisMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getRedisConnection: () => redisMock,
}));

const prismaMock = vi.hoisted(() => ({
  userSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  refreshToken: {
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

import {
  checkSessionRevoked,
  createUserSession,
  deviceLabelFromUserAgent,
  revokeAllSessionsForUser,
  revokeOtherSessionsForUser,
  revokeSessionRow,
  sessionStatus,
  setRevokedFlag,
  touchSession,
} from "./userSessionService";

describe("deviceLabelFromUserAgent", () => {
  it("monta rótulo browser + sistema", () => {
    expect(
      deviceLabelFromUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      ),
    ).toBe("Chrome em macOS");
    expect(
      deviceLabelFromUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0",
      ),
    ).toBe("Edge em Windows");
    expect(
      deviceLabelFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1"),
    ).toBe("Safari em iOS");
  });

  it("usa fallback para UA desconhecida e devolve null sem UA", () => {
    expect(deviceLabelFromUserAgent("curl/8.4.0")).toBe("cURL");
    expect(deviceLabelFromUserAgent("")).toBeNull();
    expect(deviceLabelFromUserAgent(null)).toBeNull();
  });

  it("trunca rótulos muito longos em 120 caracteres", () => {
    const label = deviceLabelFromUserAgent("x".repeat(300) + " Chrome/120.0");
    expect(label === null || label.length).toBeLessThanOrEqual(120);
  });
});

describe("checkSessionRevoked", () => {
  beforeEach(() => vi.clearAllMocks());

  it("usa a flag do Redis quando presente", async () => {
    redisMock.get.mockResolvedValue("1");
    await expect(checkSessionRevoked("s1")).resolves.toBe("revoked");
    expect(prismaMock.userSession.findUnique).not.toHaveBeenCalled();
  });

  it("Redis sem flag = ativa, sem consultar o banco", async () => {
    redisMock.get.mockResolvedValue(null);
    await expect(checkSessionRevoked("s2")).resolves.toBe("active");
    expect(prismaMock.userSession.findUnique).not.toHaveBeenCalled();
  });

  it("Redis indisponível cai para o banco (fonte de verdade)", async () => {
    redisMock.get.mockRejectedValue(new Error("connection refused"));
    prismaMock.userSession.findUnique.mockResolvedValue({
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(checkSessionRevoked("s3")).resolves.toBe("revoked");
  });

  it("Redis e banco indisponíveis devolvem unknown (falha aberta/fechada fica no chamador)", async () => {
    redisMock.get.mockRejectedValue(new Error("down"));
    prismaMock.userSession.findUnique.mockRejectedValue(new Error("db down"));
    await expect(checkSessionRevoked("s4")).resolves.toBe("unknown");
  });

  it("linha inexistente devolve unknown", async () => {
    redisMock.get.mockRejectedValue(new Error("down"));
    prismaMock.userSession.findUnique.mockResolvedValue(null);
    await expect(checkSessionRevoked("s5")).resolves.toBe("unknown");
  });

  it("sessão expirada conta como revogada no fallback de banco", async () => {
    redisMock.get.mockRejectedValue(new Error("down"));
    prismaMock.userSession.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(checkSessionRevoked("s6")).resolves.toBe("revoked");
  });
});

describe("setRevokedFlag", () => {
  beforeEach(() => vi.clearAllMocks());

  it("grava a flag com TTL e não propaga falha do Redis", async () => {
    redisMock.set.mockResolvedValue("OK");
    await expect(setRevokedFlag("s7")).resolves.toBeUndefined();
    expect(redisMock.set).toHaveBeenCalledWith("session:revoked:s7", "1", "EX", expect.any(Number));

    redisMock.set.mockRejectedValue(new Error("down"));
    await expect(setRevokedFlag("s8")).resolves.toBeUndefined();
  });
});

describe("createUserSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persiste label, ip e ua normalizados", async () => {
    prismaMock.userSession.create.mockResolvedValue({});
    await createUserSession({
      id: "sid-1",
      userId: "u1",
      barbershopId: "b1",
      refreshTokenId: "rt1",
      rememberedTokenId: "rm1",
      expiresAt: new Date(Date.now() + 1000),
      ip: "1.2.3.4",
      userAgent: "curl/8.4.0",
    });

    expect(prismaMock.userSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "sid-1",
        userId: "u1",
        ipAddress: "1.2.3.4",
        deviceLabel: "cURL",
        refreshTokenId: "rt1",
        rememberedTokenId: "rm1",
      }),
    });
  });
});

describe("revokeSessionRow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revoga, apaga os dois tokens daquele login e sinaliza no Redis", async () => {
    prismaMock.userSession.update.mockResolvedValue({});
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
    redisMock.set.mockResolvedValue("OK");

    await revokeSessionRow(
      { id: "sid-9", refreshTokenId: "rt9", rememberedTokenId: "rm9" },
      { revokedById: "admin-1", reason: "dispositivo perdido" },
    );

    expect(prismaMock.userSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sid-9" },
        data: expect.objectContaining({
          revokedById: "admin-1",
          revokedReason: "dispositivo perdido",
        }),
      }),
    );
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["rt9", "rm9"] } },
    });
    expect(redisMock.set).toHaveBeenCalledWith("session:revoked:sid-9", "1", "EX", expect.any(Number));
  });

  it("keepRemembered preserva o token de dispositivo lembrado (logout normal)", async () => {
    prismaMock.userSession.update.mockResolvedValue({});
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    redisMock.set.mockResolvedValue("OK");

    await revokeSessionRow(
      { id: "sid-10", refreshTokenId: "rt10", rememberedTokenId: "rm10" },
      { reason: "logout", keepRemembered: true },
    );

    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["rt10"] } },
    });
  });
});

describe("revokeAllSessionsForUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revoga todas as sessões, apaga todos os tokens e sinaliza cada sid", async () => {
    prismaMock.userSession.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    prismaMock.userSession.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 3 });
    redisMock.set.mockResolvedValue("OK");

    const result = await revokeAllSessionsForUser("user-1", { reason: "pedido do suporte" });

    expect(result).toEqual({ sessions: 2, tokens: 3 });
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(redisMock.set).toHaveBeenCalledWith("session:revoked:a", "1", "EX", expect.any(Number));
    expect(redisMock.set).toHaveBeenCalledWith("session:revoked:b", "1", "EX", expect.any(Number));
  });
});

describe("sessionStatus", () => {
  const base = { expiresAt: new Date(Date.now() + 60_000) };

  it("deriva active/revoked/expired", () => {
    expect(sessionStatus({ ...base, revokedAt: null })).toBe("active");
    expect(sessionStatus({ ...base, revokedAt: new Date() })).toBe("revoked");
    expect(sessionStatus({ expiresAt: new Date(Date.now() - 1000), revokedAt: null })).toBe("expired");
  });
});

describe("touchSession", () => {
  it("atualiza no máximo 1x por minuto por sid", () => {
    vi.clearAllMocks();
    prismaMock.userSession.updateMany.mockResolvedValue({ count: 1 });

    touchSession("touch-sid-1");
    touchSession("touch-sid-1");
    touchSession("touch-sid-1");

    expect(prismaMock.userSession.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("checkSessionRevoked — timeout de 150ms", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Redis que nunca responde cai no banco após o timeout", async () => {
    redisMock.get.mockReturnValue(new Promise(() => undefined));
    prismaMock.userSession.findUnique.mockResolvedValue({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const started = Date.now();
    await expect(checkSessionRevoked("slow-sid")).resolves.toBe("active");
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(prismaMock.userSession.findUnique).toHaveBeenCalled();
  });

  it("banco confirma revogação → repovoa a flag no Redis (repovoamento pós-falha)", async () => {
    redisMock.get.mockRejectedValue(new Error("redis down"));
    prismaMock.userSession.findUnique.mockResolvedValue({
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    redisMock.set.mockResolvedValue("OK");

    await expect(checkSessionRevoked("rehydrate-sid")).resolves.toBe("revoked");
    await vi.waitFor(() =>
      expect(redisMock.set).toHaveBeenCalledWith(
        "session:revoked:rehydrate-sid",
        "1",
        "EX",
        expect.any(Number),
      ),
    );
  });
});

describe("revokeOtherSessionsForUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revoga tudo exceto a sessão atual e preserva o token dela", async () => {
    prismaMock.userSession.findMany.mockResolvedValue([
      { id: "sid-b", refreshTokenId: "rt-b", rememberedTokenId: null },
      { id: "sid-c", refreshTokenId: null, rememberedTokenId: "rm-c" },
    ]);
    prismaMock.userSession.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
    redisMock.set.mockResolvedValue("OK");

    const result = await revokeOtherSessionsForUser("user-1", "sid-a", { reason: "encerrar outros" });

    expect(result).toEqual({ sessions: 2 });
    expect(prismaMock.userSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", revokedAt: null, id: { not: "sid-a" } } }),
    );
    expect(prismaMock.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", revokedAt: null, id: { not: "sid-a" } } }),
    );
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["rt-b", "rm-c"] } },
    });
    expect(redisMock.set).toHaveBeenCalledWith("session:revoked:sid-b", "1", "EX", expect.any(Number));
    expect(redisMock.set).toHaveBeenCalledWith("session:revoked:sid-c", "1", "EX", expect.any(Number));
  });

  it("sem sid atual revoga todas as ativas; sem ativas retorna 0", async () => {
    prismaMock.userSession.findMany.mockResolvedValueOnce([{ id: "x", refreshTokenId: null, rememberedTokenId: null }]);
    prismaMock.userSession.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    redisMock.set.mockResolvedValue("OK");

    await expect(
      revokeOtherSessionsForUser("user-1", null, { reason: "motivo generico aqui" }),
    ).resolves.toEqual({ sessions: 1 });
    expect(prismaMock.userSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", revokedAt: null } }),
    );

    prismaMock.userSession.findMany.mockResolvedValueOnce([]);
    vi.clearAllMocks();
    await expect(
      revokeOtherSessionsForUser("user-2", "sid-z", { reason: "motivo generico aqui" }),
    ).resolves.toEqual({ sessions: 0 });
    expect(prismaMock.userSession.updateMany).not.toHaveBeenCalled();
  });
});
