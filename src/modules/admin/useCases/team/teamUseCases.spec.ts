import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListTeamUseCase } from "./ListTeamUseCase";
import { ReactivateMemberUseCase } from "./ReactivateMemberUseCase";

const prismaMock = vi.hoisted(() => ({
  user: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  internalInvitation: {
    findMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
}));

describe("team use cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.internalInvitation.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        user: prismaMock.user,
        auditLog: prismaMock.auditLog,
      })
    );
  });

  it("keeps search filters when listing inactive internal staff", async () => {
    await new ListTeamUseCase().execute({
      page: 1,
      limit: 25,
      search: "caio",
      status: "inactive",
    });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "MASTER_ADMIN",
          AND: [
            {
              OR: [
                { name: { contains: "caio", mode: "insensitive" } },
                { email: { contains: "caio", mode: "insensitive" } },
              ],
            },
            { OR: [{ active: false }, { deletedAt: { not: null } }] },
          ],
        }),
      })
    );
  });

  it("reactivates an inactive internal admin and writes an audit log", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "target-user",
      role: "MASTER_ADMIN",
      active: false,
      deletedAt: null,
      name: "Caio",
      email: "caio@example.com",
    });
    prismaMock.user.update.mockResolvedValue({ id: "target-user", active: true });
    prismaMock.auditLog.create.mockResolvedValue({ id: "audit-1" });

    const result = await new ReactivateMemberUseCase().execute({
      targetId: "target-user",
      performedBy: "admin-user",
    });

    expect(result).toEqual({ success: true, alreadyActive: false });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "target-user" },
      data: { active: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "admin-user",
        action: "REACTIVATE_INTERNAL_ADMIN",
        resource: "User",
        resourceId: "target-user",
      }),
    });
  });

  it("does not reactivate deleted or non-internal users", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "target-user",
      role: "OWNER",
      active: false,
      deletedAt: null,
      name: "Owner",
      email: "owner@example.com",
    });

    await expect(new ReactivateMemberUseCase().execute({
      targetId: "target-user",
      performedBy: "admin-user",
    })).rejects.toMatchObject({ statusCode: 404 });

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
