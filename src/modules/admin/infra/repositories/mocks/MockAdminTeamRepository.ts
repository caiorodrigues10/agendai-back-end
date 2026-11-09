import type { Role } from "@prisma/client";
import type {
  IAdminTeamInvitation,
  IAdminTeamListItem,
} from "../../../dtos/IAdminTeamListDTO";
import type { IAdminTeamRepository } from "../../../repositories/IAdminTeamRepository";

/**
 * Membro da equipe interna em memória.
 *
 * `deletedAt` preenchido = membro removido (soft-delete): só aparece quando o
 * filtro `status=inactive` é pedido.
 */
interface MockInternalMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  ticketsAssigned: number;
  tasksAssigned: number;
}

interface MockInternalInvitation {
  id: string;
  email: string;
  status: string;
  permissions: string[];
  expiresAt: Date;
  createdAt: Date;
  invitedBy: { name: string };
}

/**
 * Mock da listagem da equipe interna do admin.
 *
 * Espelha o `where` do repositório real (`adminTeamListWhere.ts`): escopo da
 * plataforma (equipe interna por padrão, papel pedido quando `role` vem), uma
 * cláusula por filtro (busca, situação, status) e ordenação
 * `nome`/`email`/`cargo`/`criado` com `id` de desempate.
 */
export class MockAdminTeamRepository implements IAdminTeamRepository {
  private members: MockInternalMember[] = [];
  private invitations: MockInternalInvitation[] = [];
  private seq = 1;

  async createMember(
    payload: Partial<MockInternalMember> & { name: string; email: string },
  ): Promise<MockInternalMember> {
    const now = new Date();
    const member: MockInternalMember = {
      id: payload.id ?? `internal-${this.seq++}`,
      name: payload.name,
      email: payload.email,
      role: payload.role ?? "MASTER_ADMIN",
      active: payload.active ?? true,
      avatarUrl: payload.avatarUrl ?? null,
      createdAt: payload.createdAt ?? now,
      updatedAt: payload.updatedAt ?? now,
      deletedAt: payload.deletedAt ?? null,
      ticketsAssigned: payload.ticketsAssigned ?? 0,
      tasksAssigned: payload.tasksAssigned ?? 0,
    };
    this.members.push(member);
    return member;
  }

  async createInvitation(
    payload: Partial<MockInternalInvitation> & { email: string },
  ): Promise<MockInternalInvitation> {
    const now = new Date();
    const invitation: MockInternalInvitation = {
      id: payload.id ?? `invitation-${this.seq++}`,
      email: payload.email,
      status: payload.status ?? "PENDING",
      permissions: payload.permissions ?? [],
      expiresAt: payload.expiresAt ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      createdAt: payload.createdAt ?? now,
      invitedBy: payload.invitedBy ?? { name: "Admin" },
    };
    this.invitations.push(invitation);
    return invitation;
  }

  async list(
    query: Parameters<IAdminTeamRepository["list"]>[0],
  ): Promise<{ users: IAdminTeamListItem[]; total: number }> {
    // Escopo: equipe interna por padrão; com `role`, o papel pedido.
    let results = this.members.filter((m) =>
      query.role ? m.role === query.role : m.role === "MASTER_ADMIN",
    );

    if (query.search) {
      const term = query.search.toLowerCase();
      results = results.filter(
        (m) =>
          m.name.toLowerCase().includes(term) ||
          m.email.toLowerCase().includes(term),
      );
    }

    if (typeof query.active === "boolean") {
      results = results.filter((m) => m.active === query.active);
    }

    if (query.status === "active") {
      results = results.filter((m) => m.active && m.deletedAt === null);
    } else if (query.status === "inactive") {
      results = results.filter((m) => !m.active || m.deletedAt !== null);
    } else {
      results = results.filter((m) => m.deletedAt === null);
    }

    const dir = query.sort?.dir ?? "desc";
    const field = query.sort?.field;
    const sorted = [...results].sort((a, b) => {
      let cmp = 0;

      if (field === "nome") {
        cmp = a.name.localeCompare(b.name);
      } else if (field === "email") {
        cmp = a.email.localeCompare(b.email);
      } else if (field === "cargo") {
        cmp = a.role.localeCompare(b.role);
      } else if (field === "criado") {
        cmp = a.createdAt.getTime() - b.createdAt.getTime();
      } else {
        cmp = a.createdAt.getTime() - b.createdAt.getTime();
      }

      if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      return dir === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    });

    const total = sorted.length;
    const start = (query.page - 1) * query.limit;

    return {
      users: sorted.slice(start, start + query.limit).map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        active: m.active,
        avatarUrl: m.avatarUrl,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        _count: {
          ticketsAssigned: m.ticketsAssigned,
          tasksAssigned: m.tasksAssigned,
        },
      })),
      total,
    };
  }

  async listInvitations(
    status?: "active" | "inactive",
  ): Promise<IAdminTeamInvitation[]> {
    const filtered = this.invitations.filter((invitation) => {
      if (status === "active") return invitation.status === "PENDING";
      if (status === "inactive") {
        return invitation.status === "EXPIRED" || invitation.status === "REVOKED";
      }
      return true;
    });

    return filtered
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20)
      .map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        permissions: invitation.permissions,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        invitedBy: invitation.invitedBy,
      }));
  }
}
