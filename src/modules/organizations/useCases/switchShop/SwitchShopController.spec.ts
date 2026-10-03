/// <reference types="vitest/globals" />
import { sign, verify, Secret } from "jsonwebtoken";
import auth from "@/config/auth";
import { logAccess } from "@/shared/services/accessLogService";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  barbershopFindUnique: vi.fn(),
  orgMemberFindUnique: vi.fn(),
  refreshFindFirst: vi.fn(),
  refreshDeleteMany: vi.fn(),
  refreshCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  repoFindById: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      findFirst: mocks.userFindFirst,
      update: mocks.userUpdate,
      updateMany: mocks.userUpdate,
    },
    barbershop: { findUnique: mocks.barbershopFindUnique },
    organizationMember: { findUnique: mocks.orgMemberFindUnique },
    refreshToken: {
      findFirst: mocks.refreshFindFirst,
      deleteMany: mocks.refreshDeleteMany,
      create: mocks.refreshCreate,
    },
    auditLog: { create: mocks.auditLogCreate },
    accessLog: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock("@/shared/services/accessLogService", () => ({
  logAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("tsyringe", () => ({
  container: {
    resolve: () => ({ findById: mocks.repoFindById }),
  },
}));

import { SwitchShopController } from "./SwitchShopController";
import { RefreshController } from "@/modules/auth/useCases/refresh/RefreshController";

const ORG_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const HOME_SHOP = "11111111-1111-4111-8111-111111111111";
const TARGET_SHOP = "22222222-2222-4222-8222-222222222222";
const FOREIGN_SHOP = "44444444-4444-4444-8444-444444444444";

type SessionToken = { sub?: string; role?: string; barbershopId?: string };

function sessionRefreshToken() {
  return sign(
    { sub: USER_ID, jti: "jti-1", persistent: true, purpose: "session" },
    auth.refreshSecret as Secret,
    { expiresIn: "7d" },
  );
}

function replyCapture() {
  const state: { statusCode?: number; body?: any; cookies?: Record<string, string> } = {};
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
    setCookie(name: string, value: string) {
      cookies[name] = value;
      state.cookies = cookies;
      return reply;
    },
  };
  return { reply, state };
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: USER_ID, role: "OWNER", barbershopId: HOME_SHOP },
    params: { id: ORG_ID },
    body: { barbershopId: TARGET_SHOP },
    cookies: { refresh_token: sessionRefreshToken() },
    ip: "127.0.0.1",
    headers: { "user-agent": "vitest" },
    ...overrides,
  } as any;
}

function givenUser(overrides: Record<string, unknown> = {}) {
  mocks.userFindUnique.mockResolvedValue({
    id: USER_ID,
    name: "Caio",
    email: "caio@example.test",
    role: "OWNER",
    barbershopId: HOME_SHOP,
    emailVerified: true,
    active: true,
    deletedAt: null,
    ...overrides,
  });
}

/** Salão do alvo dentro da organização (chamado pelo controller e pelo resolveOrgAccess). */
function givenShopInOrg(organizationId: string | null = ORG_ID) {
  mocks.barbershopFindUnique.mockImplementation(async ({ where }: any) =>
    where.id === FOREIGN_SHOP ? { organizationId: OTHER_ORG_ID } : { organizationId },
  );
}

/** resolveOrgAccessToBarbershop: dono direto do salão? senão papel na organização. */
function givenOrgMembership(role: string | null) {
  mocks.userFindFirst.mockResolvedValue(null);
  mocks.orgMemberFindUnique.mockResolvedValue(role ? { role } : null);
}

function givenRefreshRecord(token: string) {
  mocks.refreshFindFirst.mockResolvedValue({
    id: "refresh-1",
    token,
    userId: USER_ID,
    purpose: "session",
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    createdAt: new Date(),
  });
  mocks.refreshCreate.mockImplementation(async ({ data }: any) => data);
  mocks.refreshDeleteMany.mockResolvedValue({ count: 1 });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auditLogCreate.mockResolvedValue({});
});

describe("SwitchShopController", () => {
  it("troca para um salão da organização quando o acesso é FULL", async () => {
    givenUser();
    givenShopInOrg();
    givenOrgMembership("ADMIN");
    givenRefreshRecord(sessionRefreshToken());

    const { reply, state } = replyCapture();
    await new SwitchShopController().handle(makeRequest(), reply as any);

    expect(state.statusCode).toBe(200);
    expect(state.body.user.barbershopId).toBe(TARGET_SHOP);
    expect(state.body.user.role).toBe("owner");

    const access = verify(state.body.accessToken, auth.secret as Secret) as SessionToken;
    expect(access.sub).toBe(USER_ID);
    expect(access.barbershopId).toBe(TARGET_SHOP);

    // O salão de origem permanece no banco (nenhuma escrita em users).
    expect(mocks.userUpdate).not.toHaveBeenCalled();

    // Auditoria: action SWITCH_SHOP com origem e destino.
    expect(logAccess).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, action: "SWITCH_SHOP" }),
    );
    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        action: "SWITCH_SHOP",
        resourceId: TARGET_SHOP,
        details: JSON.stringify({
          from: HOME_SHOP,
          to: TARGET_SHOP,
          organizationId: ORG_ID,
        }),
      }),
    });
  });

  it("grava o salão alvo no refresh token e devolve o novo cookie", async () => {
    givenUser();
    givenShopInOrg();
    givenOrgMembership("ADMIN");
    const original = sessionRefreshToken();
    givenRefreshRecord(original);

    const { reply, state } = replyCapture();
    await new SwitchShopController().handle(makeRequest(), reply as any);

    expect(mocks.refreshDeleteMany).toHaveBeenCalledWith({
      where: { token: original, purpose: "session" },
    });
    const created = mocks.refreshCreate.mock.calls[0][0].data;
    const rotated = verify(created.token, auth.refreshSecret as Secret) as SessionToken & {
      purpose: string;
      activeBarbershopId?: string;
    };
    expect(rotated.activeBarbershopId).toBe(TARGET_SHOP);
    expect(rotated.purpose).toBe("session");
    expect(state.cookies?.refresh_token).toBe(created.token);
  });

  it("emite papel efetivo OWNER para um EMPLOYEE que é OWNER/ADMIN da organização", async () => {
    givenUser({ role: "EMPLOYEE" });
    givenShopInOrg();
    givenOrgMembership("OWNER");
    givenRefreshRecord(sessionRefreshToken());

    const { reply, state } = replyCapture();
    await new SwitchShopController().handle(makeRequest(), reply as any);

    const access = verify(state.body.accessToken, auth.secret as Secret) as SessionToken;
    expect(access.role).toBe("OWNER");
    expect(state.body.user.role).toBe("owner");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("recusa quando o acesso à organização é OPERATIONAL", async () => {
    givenUser();
    givenShopInOrg();
    givenOrgMembership("MEMBER");
    givenRefreshRecord(sessionRefreshToken());

    const { reply } = replyCapture();
    await expect(
      new SwitchShopController().handle(makeRequest(), reply as any),
    ).rejects.toMatchObject({ statusCode: 403, message: "Você não tem acesso a este salão" });
    expect(mocks.refreshCreate).not.toHaveBeenCalled();
    expect(logAccess).not.toHaveBeenCalled();
  });

  it("recusa quando não há acesso (NONE)", async () => {
    givenUser();
    givenShopInOrg();
    givenOrgMembership(null);
    givenRefreshRecord(sessionRefreshToken());

    const { reply } = replyCapture();
    await expect(
      new SwitchShopController().handle(makeRequest(), reply as any),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("recusa um salão que pertence a outra organização", async () => {
    givenUser();
    mocks.barbershopFindUnique.mockResolvedValue({ organizationId: OTHER_ORG_ID });
    givenRefreshRecord(sessionRefreshToken());

    const { reply } = replyCapture();
    await expect(
      new SwitchShopController().handle(makeRequest(), reply as any),
    ).rejects.toMatchObject({ statusCode: 403, message: "Salão não pertence a esta organização" });
    // Nem chegou a resolver acesso.
    expect(mocks.userFindFirst).not.toHaveBeenCalled();
    expect(mocks.orgMemberFindUnique).not.toHaveBeenCalled();
  });

  it("recusa um salão inexistente sem revelar o motivo", async () => {
    givenUser();
    mocks.barbershopFindUnique.mockResolvedValue(null);

    const { reply } = replyCapture();
    await expect(
      new SwitchShopController().handle(makeRequest(), reply as any),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("permite voltar para o salão de origem sem vínculo com a organização", async () => {
    givenUser();
    givenRefreshRecord(sessionRefreshToken());

    const { reply, state } = replyCapture();
    await new SwitchShopController().handle(
      makeRequest({ body: { barbershopId: HOME_SHOP } }),
      reply as any,
    );

    expect(state.statusCode).toBe(200);
    expect(state.body.user.barbershopId).toBe(HOME_SHOP);
    // Restaurar a própria sessão não consulta salão/organização.
    expect(mocks.barbershopFindUnique).not.toHaveBeenCalled();
    expect(mocks.orgMemberFindUnique).not.toHaveBeenCalled();
  });

  it("valida body e params com zod (uuid estrito)", async () => {
    givenUser();
    const { reply } = replyCapture();

    await expect(
      new SwitchShopController().handle(
        makeRequest({ body: { barbershopId: "não-é-uuid" } }),
        reply as any,
      ),
    ).rejects.toThrow();
    await expect(
      new SwitchShopController().handle(makeRequest({ params: { id: "org-invalida" } }), reply as any),
    ).rejects.toThrow();
  });
});

describe("RefreshController mantém o salão trocado", () => {
  function refreshRequest(token: string) {
    return {
      cookies: { refresh_token: token },
      ip: "127.0.0.1",
      headers: { "user-agent": "vitest" },
    } as any;
  }

  function givenSwitchedSession(access: string | null = "ADMIN") {
    mocks.repoFindById.mockResolvedValue({
      id: USER_ID,
      name: "Caio",
      email: "caio@example.test",
      role: "OWNER",
      barbershopId: HOME_SHOP,
      emailVerified: true,
      cpf: null,
    });
    givenShopInOrg();
    givenOrgMembership(access);
  }

  it("emite access token com o salão alvo e mantém o claim na rotação", async () => {
    givenSwitchedSession();
    const token = sign(
      {
        sub: USER_ID,
        jti: "jti-2",
        persistent: true,
        purpose: "session",
        activeBarbershopId: TARGET_SHOP,
      },
      auth.refreshSecret as Secret,
      { expiresIn: "7d" },
    );
    givenRefreshRecord(token);

    const { reply, state } = replyCapture();
    await new RefreshController().handle(refreshRequest(token), reply as any);

    expect(state.statusCode).toBe(200);
    expect(state.body.user.barbershopId).toBe(TARGET_SHOP);

    const access = verify(state.body.accessToken, auth.secret as Secret) as SessionToken;
    expect(access.barbershopId).toBe(TARGET_SHOP);

    const rotated = verify(
      mocks.refreshCreate.mock.calls[0][0].data.token,
      auth.refreshSecret as Secret,
    ) as SessionToken & { activeBarbershopId?: string };
    expect(rotated.activeBarbershopId).toBe(TARGET_SHOP);
  });

  it("volta para o salão de origem quando o acesso à organização acabou", async () => {
    givenSwitchedSession(null);
    const token = sign(
      {
        sub: USER_ID,
        jti: "jti-3",
        persistent: true,
        purpose: "session",
        activeBarbershopId: TARGET_SHOP,
      },
      auth.refreshSecret as Secret,
      { expiresIn: "7d" },
    );
    givenRefreshRecord(token);

    const { reply, state } = replyCapture();
    await new RefreshController().handle(refreshRequest(token), reply as any);

    expect(state.statusCode).toBe(200);
    expect(state.body.user.barbershopId).toBe(HOME_SHOP);
    const access = verify(state.body.accessToken, auth.secret as Secret) as SessionToken;
    expect(access.barbershopId).toBe(HOME_SHOP);
  });

  it("sessão sem o claim continua no salão original", async () => {
    givenSwitchedSession();
    const token = sessionRefreshToken();
    givenRefreshRecord(token);

    const { reply, state } = replyCapture();
    await new RefreshController().handle(refreshRequest(token), reply as any);

    expect(state.body.user.barbershopId).toBe(HOME_SHOP);
    const rotated = verify(
      mocks.refreshCreate.mock.calls[0][0].data.token,
      auth.refreshSecret as Secret,
    ) as SessionToken & { activeBarbershopId?: string };
    expect(rotated.activeBarbershopId).toBeUndefined();
  });
});
