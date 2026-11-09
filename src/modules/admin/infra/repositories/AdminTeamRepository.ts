import { prisma } from "@/libs/prismaClient";
import type { Prisma } from "@prisma/client";
import { toSkipTake } from "@/shared/utils/pagination";
import type {
  IAdminTeamInvitation,
  IAdminTeamListItem,
} from "../../dtos/IAdminTeamListDTO";
import type { IAdminTeamRepository } from "../../repositories/IAdminTeamRepository";
import {
  buildAdminTeamListOrderBy,
  buildAdminTeamListWhere,
} from "../../repositories/adminTeamListWhere";

/**
 * Campos devolvidos na listagem da equipe interna.
 *
 * Nada de `password` (hash), `googleSub`, `cpf`, `deletedAt` ou das relações
 * de token (`refreshTokens`, `userSessions`).
 */
const adminTeamSelect = {
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
      ticketsAssigned: {
        where: { status: { notIn: ["RESOLVED", "CANCELLED"] } },
      },
      tasksAssigned: {
        where: { status: { notIn: ["DONE", "CANCELLED"] } },
      },
    },
  },
} satisfies Prisma.UserSelect;

const invitationSelect = {
  id: true,
  email: true,
  status: true,
  permissions: true,
  expiresAt: true,
  createdAt: true,
  invitedBy: { select: { name: true } },
} satisfies Prisma.InternalInvitationSelect;

export class AdminTeamRepository implements IAdminTeamRepository {
  async list(
    query: Parameters<IAdminTeamRepository["list"]>[0],
  ): Promise<{ users: IAdminTeamListItem[]; total: number }> {
    const { skip, take } = toSkipTake(query.page, query.limit);

    const where = buildAdminTeamListWhere(query);
    const orderBy = buildAdminTeamListOrderBy(query.sort);

    const [records, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy,
        select: adminTeamSelect,
      }),
      // `total` conta o conjunto filtrado inteiro, não só a página.
      prisma.user.count({ where }),
    ]);

    return { users: records, total };
  }

  async listInvitations(
    status?: "active" | "inactive",
  ): Promise<IAdminTeamInvitation[]> {
    return prisma.internalInvitation.findMany({
      where:
        status === "active"
          ? { status: "PENDING" }
          : status === "inactive"
            ? { status: { in: ["EXPIRED", "REVOKED"] } }
            : {},
      select: invitationSelect,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }
}
