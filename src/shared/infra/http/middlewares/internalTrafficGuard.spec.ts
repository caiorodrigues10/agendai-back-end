import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/libs/prismaClient";
import { INTERNAL_PERMISSIONS } from "@/modules/admin/internalPermissions";
import { internalTrafficGuard } from "./internalTrafficGuard";

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

function request(user?: {
  id?: string;
  role?: string;
  barbershopId?: string;
  permissions?: string[];
}) {
  return { user } as never;
}

const reply = {} as never;

/** Simula o `verifyInternalAdmin`: devolve o admin interno com as permissões dadas. */
function mockInternalAdmin(permissions: string[]) {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "admin-1",
    role: "MASTER_ADMIN",
    active: true,
    deletedAt: null,
    permissions,
  } as never);
}

describe("internalTrafficGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("nega MASTER_ADMIN sem internal:traffic:read", async () => {
    mockInternalAdmin([INTERNAL_PERMISSIONS.DASHBOARD_READ]);

    await expect(
      internalTrafficGuard(
        request({ id: "admin-1", role: "MASTER_ADMIN" }),
        reply
      )
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Você não tem permissão para acessar esta área interna",
    });
  });

  it("libera MASTER_ADMIN com internal:traffic:read", async () => {
    mockInternalAdmin([INTERNAL_PERMISSIONS.TRAFFIC_READ]);

    await expect(
      internalTrafficGuard(
        request({ id: "admin-1", role: "MASTER_ADMIN" }),
        reply
      )
    ).resolves.toBeUndefined();
  });

  it("libera MASTER_ADMIN com internal:all", async () => {
    mockInternalAdmin([INTERNAL_PERMISSIONS.ALL]);

    await expect(
      internalTrafficGuard(
        request({ id: "admin-1", role: "MASTER_ADMIN" }),
        reply
      )
    ).resolves.toBeUndefined();
  });

  it("libera MASTER_ADMIN sem permissões explícitas (acesso total)", async () => {
    mockInternalAdmin([]);

    await expect(
      internalTrafficGuard(
        request({ id: "admin-1", role: "MASTER_ADMIN" }),
        reply
      )
    ).resolves.toBeUndefined();
  });

  it("OWNER não passa por verifyInternalAdmin", async () => {
    await expect(
      internalTrafficGuard(
        request({ id: "owner-1", role: "OWNER", barbershopId: "shop-1" }),
        reply
      )
    ).resolves.toBeUndefined();

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("EMPLOYEE não passa por verifyInternalAdmin", async () => {
    await expect(
      internalTrafficGuard(
        request({ id: "emp-1", role: "EMPLOYEE", barbershopId: "shop-1" }),
        reply
      )
    ).resolves.toBeUndefined();

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("nega MASTER_ADMIN inativo (guarda de verifyInternalAdmin)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "admin-1",
      role: "MASTER_ADMIN",
      active: false,
      deletedAt: null,
      permissions: [INTERNAL_PERMISSIONS.TRAFFIC_READ],
    } as never);

    await expect(
      internalTrafficGuard(
        request({ id: "admin-1", role: "MASTER_ADMIN" }),
        reply
      )
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
