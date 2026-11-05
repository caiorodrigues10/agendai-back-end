import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListTeamUseCase } from "./ListTeamUseCase";
import { ReactivateMemberUseCase } from "./ReactivateMemberUseCase";
import { buildAdminTeamListWhere } from "../../repositories/adminTeamListWhere";
import type { IAdminTeamRepository } from "../../repositories/IAdminTeamRepository";

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

function repositoryDouble(): IAdminTeamRepository {
  return {
    list: vi.fn(async () => ({ users: [], total: 0 })),
    listInvitations: vi.fn(async () => []),
  };
}

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
    const repository = repositoryDouble();

    await new ListTeamUseCase(repository).execute({
      page: 1,
      limit: 25,
      search: "caio",
      status: "inactive",
    });

    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 25,
        search: "caio",
        status: "inactive",
      }),
    );
    expect(repository.listInvitations).toHaveBeenCalledWith("inactive");
  });

  it("the where of the internal team keeps the search filter with status=inactive", () => {
    const where = buildAdminTeamListWhere({
      search: "caio",
      status: "inactive",
    });

    expect(where).toEqual({
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
    });
  });

  it("returns the users, the invitations and the filtered total", async () => {
    const repository = repositoryDouble();
    vi.mocked(repository.list).mockResolvedValue({
      users: [
        {
          id: "internal-1",
          name: "Caio",
          email: "caio@agendai.com",
          role: "MASTER_ADMIN",
          active: true,
          avatarUrl: null,
          createdAt: new Date("2026-10-01T12:00:00.000Z"),
          updatedAt: new Date("2026-10-01T12:00:00.000Z"),
          _count: { ticketsAssigned: 1, tasksAssigned: 2 },
        },
      ],
      total: 3,
    });
    vi.mocked(repository.listInvitations).mockResolvedValue([
      {
        id: "invitation-1",
        email: "novo@agendai.com",
        status: "PENDING",
        permissions: [],
        expiresAt: new Date("2026-12-01T12:00:00.000Z"),
        createdAt: new Date("2026-10-01T12:00:00.000Z"),
        invitedBy: { name: "Admin" },
      },
    ]);

    const result = await new ListTeamUseCase(repository).execute({
      page: 1,
      limit: 25,
    });

    expect(result.total).toBe(3);
    expect(result.users).toHaveLength(1);
    expect(result.invitations).toHaveLength(1);
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
