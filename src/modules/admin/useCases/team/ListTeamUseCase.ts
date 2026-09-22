import { prisma } from "@/libs/prismaClient";

export class ListTeamUseCase {
  async execute(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) {
    const { page = 1, limit = 25, search, status } = params;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status === "active") {
      where.active = true;
      where.deletedAt = null;
    } else if (status === "inactive") {
      where.OR = [{ active: false }, { deletedAt: { not: null } }];
    } else {
      where.deletedAt = null;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: { ...where, role: "MASTER_ADMIN" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              ticketsAssigned: { where: { status: { notIn: ["RESOLVED", "CANCELLED"] } } },
              tasksAssigned: { where: { status: { notIn: ["DONE", "CANCELLED"] } } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({
        where: { ...where, role: "MASTER_ADMIN" },
      }),
    ]);

    const invitations = await prisma.internalInvitation.findMany({
      where: status === "active"
        ? { status: "PENDING" }
        : status === "inactive"
          ? { status: { in: ["EXPIRED", "REVOKED"] } }
          : {},
      select: {
        id: true,
        email: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return {
      users,
      invitations,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
