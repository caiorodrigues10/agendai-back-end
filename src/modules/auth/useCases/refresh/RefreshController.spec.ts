/// <reference types="vitest/globals" />
import { sign } from "jsonwebtoken";
import auth from "@/config/auth";

describe("RefreshController rotation", () => {
  const userId = "22222222-2222-4222-8222-222222222222";

  type TokenRow = { token: string; userId: string; expiresAt: Date; createdAt: Date };

  function replyCapture() {
    const state: { statusCode?: number; body?: any; cookies?: Record<string, string>; cookieOptions?: Record<string, any> } = {};
    const cookies: Record<string, string> = {};
    const reply = {
      status(code: number) {
        state.statusCode = code;
        return reply;
      },
      send(body: unknown) {
        state.body = body;
        return reply;
      },
      setCookie(name: string, value: string, opts: any) {
        cookies[name] = value;
        state.cookies = cookies;
        state.cookieOptions = { ...(state.cookieOptions ?? {}), [name]: opts };
        return reply;
      },
    };
    return { reply, state };
  }

  function tokenStore(initial: TokenRow) {
    const store = new Map<string, TokenRow>();
    store.set(initial.token, initial);
    const matches = (row: TokenRow, where: Record<string, any>) => {
      if (where.token && row.token !== where.token) return false;
      if (where.userId && row.userId !== where.userId) return false;
      if (where.createdAt?.gte && row.createdAt < where.createdAt.gte) return false;
      if (where.expiresAt?.gt && !(row.expiresAt > where.expiresAt.gt)) return false;
      return true;
    };
    return {
      store,
      prisma: {
        refreshToken: {
          findFirst: vi.fn(async ({ where, orderBy }: { where: Record<string, any>; orderBy?: { createdAt: string } }) => {
            const rows = [...store.values()].filter((row) => matches(row, where));
            if (orderBy?.createdAt === "desc") {
              rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            }
            return rows[0] ?? null;
          }),
          deleteMany: vi.fn(async ({ where }: { where: { token: string } }) => {
            store.delete(where.token);
            return { count: 1 };
          }),
          create: vi.fn(async ({ data }: { data: { token: string; userId: string; expiresAt: Date } }) => {
            const row = { ...data, createdAt: new Date() };
            store.set(data.token, row);
            return row;
          }),
        },
        accessLog: { create: vi.fn().mockResolvedValue({}) },
      },
    };
  }

  async function loadRefreshController(prismaMock: unknown) {
    vi.resetModules();
    vi.doMock("@/shared/services/accessLogService", () => ({
      logAccess: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/libs/prismaClient", () => ({ prisma: prismaMock }));
    vi.doMock("tsyringe", () => ({
      container: {
        resolve: () => ({
          async findById(id: string) {
            if (id !== userId) return null;
            return {
              id: userId,
              name: "Synthetic Owner",
              email: "owner@example.test",
              role: "OWNER",
              barbershopId: "11111111-1111-4111-8111-111111111111",
              cpf: null,
            };
          },
        }),
      },
    }));
    const { RefreshController } = await import("./RefreshController");
    return new RefreshController();
  }

  it("rotates refresh and allows reuse of the previous token within the grace window", async () => {
    const refreshToken = sign({ sub: userId }, auth.refreshSecret, { expiresIn: "7d" });
    const { store, prisma: prismaMock } = tokenStore({
      token: refreshToken,
      userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 60_000),
    });

    const controller = await loadRefreshController(prismaMock);

    const first = replyCapture();
    await controller.handle(
      { cookies: { refresh_token: refreshToken }, ip: "127.0.0.1", headers: { "user-agent": "test" } } as any,
      first.reply as any
    );
    expect(first.state.statusCode).toBe(200);
    expect(first.state.body?.accessToken).toBeTypeOf("string");
    expect(store.has(refreshToken)).toBe(false);

    const reuse = replyCapture();
    await controller.handle(
      { cookies: { refresh_token: refreshToken }, ip: "127.0.0.1", headers: { "user-agent": "test" } } as any,
      reuse.reply as any
    );
    expect(reuse.state.statusCode).toBe(200);
    expect(reuse.state.body?.accessToken).toBeTypeOf("string");
    expect(reuse.state.cookies?.refresh_token).toBe(first.state.cookies?.refresh_token);

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("rejects reuse of the previous token after the grace window", async () => {
    const refreshToken = sign({ sub: userId }, auth.refreshSecret, { expiresIn: "7d" });
    const { store, prisma: prismaMock } = tokenStore({
      token: refreshToken,
      userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 60_000),
    });

    const controller = await loadRefreshController(prismaMock);

    const first = replyCapture();
    await controller.handle(
      { cookies: { refresh_token: refreshToken }, ip: "127.0.0.1", headers: { "user-agent": "test" } } as any,
      first.reply as any
    );
    expect(first.state.statusCode).toBe(200);
    for (const row of store.values()) {
      row.createdAt = new Date(Date.now() - 30_000);
    }

    const reuse = replyCapture();
    await controller.handle(
      { cookies: { refresh_token: refreshToken }, ip: "127.0.0.1", headers: { "user-agent": "test" } } as any,
      reuse.reply as any
    );
    expect(reuse.state.statusCode).toBe(401);
    expect(reuse.state.body).toEqual({ message: "Refresh token inválido" });

    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("duas abas recarregando ao mesmo tempo: as duas renovam e nenhuma é deslogada", async () => {
    const startToken = sign({ sub: userId }, auth.refreshSecret, { expiresIn: "7d" });
    const { store, prisma: prismaMock } = tokenStore({
      token: startToken,
      userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });

    const controller = await loadRefreshController(prismaMock);
    const requestWithStartToken = () =>
      ({ cookies: { refresh_token: startToken }, ip: "127.0.0.1", headers: { "user-agent": "test" } }) as any;

    // As duas abas disparam o refresh com o MESMO cookie: a rotação da aba A
    // ainda não foi aplicada no jar da aba B.
    const tabA = replyCapture();
    await controller.handle(requestWithStartToken(), tabA.reply as any);
    const tabB = replyCapture();
    await controller.handle(requestWithStartToken(), tabB.reply as any);

    expect(tabA.state.statusCode).toBe(200);
    expect(tabB.state.statusCode).toBe(200);
    expect(tabA.state.body?.accessToken).toBeTypeOf("string");
    expect(tabB.state.body?.accessToken).toBeTypeOf("string");
    // A aba B recebe o cookie corrente (o mesmo da aba A) em vez de sessão nova.
    expect(tabB.state.cookies?.refresh_token).toBe(tabA.state.cookies?.refresh_token);

    // Nenhuma aba ficou sem sessão: o próximo load renova normalmente e
    // continua existindo exatamente um refresh token vivo.
    const next = replyCapture();
    await controller.handle(
      { cookies: { refresh_token: tabA.state.cookies?.refresh_token }, ip: "127.0.0.1", headers: { "user-agent": "test" } } as any,
      next.reply as any
    );
    expect(next.state.statusCode).toBe(200);
    expect(store.size).toBe(1);

    vi.restoreAllMocks();
    vi.resetModules();
  });
});
