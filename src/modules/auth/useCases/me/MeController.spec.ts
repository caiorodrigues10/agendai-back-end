import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
}));

vi.mock("@/modules/users/infra/repositories/UserRepository", () => ({
  UserRepository: class {
    findById = mocks.findById;
  },
}));

import { MeController } from "./MeController";

function replyCollector() {
  const sent: Array<{ user: Record<string, unknown> }> = [];
  return { sent, reply: { status: () => ({ send: (p: unknown) => sent.push(p as never) }) } as never };
}

function request(role: string) {
  return { user: { id: "user-1", role } } as never;
}

describe("MeController — permissões internas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expõe internalPermissions para MASTER_ADMIN", async () => {
    mocks.findById.mockResolvedValue({
      id: "user-1",
      name: "Admin",
      email: "admin@example.com",
      role: "MASTER_ADMIN",
      permissions: ["internal:whatsapp:manage"],
      barbershopId: null,
      avatarUrl: null,
      emailVerified: true,
    });
    const { sent, reply } = replyCollector();

    await new MeController().handle(request("MASTER_ADMIN"), reply);

    expect(sent[0].user).toMatchObject({
      role: "admin",
      internalPermissions: ["internal:whatsapp:manage"],
    });
    expect(sent[0].user.permissions).toBeUndefined();
  });

  it("não expõe internalPermissions para OWNER", async () => {
    mocks.findById.mockResolvedValue({
      id: "user-3",
      name: "Dono",
      email: "owner@example.com",
      role: "OWNER",
      permissions: ["internal:whatsapp:manage"],
      barbershopId: "shop-1",
      avatarUrl: null,
      emailVerified: true,
    });
    const { sent, reply } = replyCollector();

    await new MeController().handle(request("OWNER"), reply);

    expect(sent[0].user).toMatchObject({ role: "owner" });
    expect(sent[0].user.internalPermissions).toBeUndefined();
  });

  it("mantém permissions de EMPLOYEE e não expõe internalPermissions", async () => {
    mocks.findById.mockResolvedValue({
      id: "user-2",
      name: "Funcionário",
      email: "emp@example.com",
      role: "EMPLOYEE",
      permissions: ["QUEUE_MANAGE"],
      barbershopId: "shop-1",
      avatarUrl: null,
      emailVerified: true,
    });
    const { sent, reply } = replyCollector();

    await new MeController().handle(request("EMPLOYEE"), reply);

    expect(sent[0].user).toMatchObject({
      role: "employee",
      permissions: ["QUEUE_MANAGE"],
    });
    expect(sent[0].user.internalPermissions).toBeUndefined();
  });
});
