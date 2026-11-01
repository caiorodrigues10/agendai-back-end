import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  createToken: vi.fn(),
  createUserSession: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    refreshToken: {
      deleteMany: mocks.deleteMany,
      create: mocks.createToken,
    },
  },
}));

vi.mock("./userSessionService", () => ({
  createUserSession: mocks.createUserSession,
  newSessionId: () => "session-1",
}));

import { issueAuthSession } from "./issueAuthSession";

function user(role: string, permissions?: string[]) {
  return {
    id: "user-1",
    name: "Usuário",
    email: "user@example.com",
    role,
    barbershopId: role === "MASTER_ADMIN" ? null : "shop-1",
    cpf: null,
    emailVerified: true,
    permissions,
  };
}

describe("issueAuthSession — permissões internas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    mocks.createToken
      .mockResolvedValueOnce({ id: "token-session" })
      .mockResolvedValueOnce({ id: "token-device" });
    mocks.createUserSession.mockResolvedValue(undefined);
  });

  it("expõe internalPermissions no login do MASTER_ADMIN", async () => {
    const session = await issueAuthSession(user("MASTER_ADMIN", ["internal:whatsapp:manage"]));

    expect(session.user.internalPermissions).toEqual(["internal:whatsapp:manage"]);
  });

  it("não expõe internalPermissions no login de OWNER", async () => {
    const session = await issueAuthSession(user("OWNER", ["internal:whatsapp:manage"]));

    expect(session.user.internalPermissions).toBeUndefined();
  });

  it("não expõe internalPermissions no login de EMPLOYEE", async () => {
    const session = await issueAuthSession(user("EMPLOYEE", ["QUEUE_MANAGE"]));

    expect(session.user.internalPermissions).toBeUndefined();
    expect(session.user.permissions).toEqual(["QUEUE_MANAGE"]);
  });
});
