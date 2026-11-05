import { prisma } from "@/libs/prismaClient";
import { IUserRepository } from "../../repositories/IUserRepository";
import { ICreateUserDTO } from "../../dtos/ICreateUserDTO";
import { IUserResponseDTO } from "../../dtos/IUserResponseDTO";
import type {
  IListTeamQuery,
  IUserListItem,
  IUserListResult,
} from "../../dtos/IUserListDTO";
import {
  buildUserListOrderBy,
  buildUserListWhere,
} from "../../repositories/userListWhere";
import { toSkipTake } from "@/shared/utils/pagination";

const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  barbershopId: true,
  cpf: true,
  createdAt: true,
  active: true,
  deletedAt: true,
  termsVersion: true,
  termsAcceptedAt: true,
  marketingOptIn: true,
  marketingOptInAt: true,
  lgpdConsentAt: true,
  avatarUrl: true,
  emailVerified: true,
} as const;

/**
 * Select da listagem da equipe (`GET /api/users`).
 *
 * É o MESMO conjunto de campos que a rota já devolvia antes da paginação:
 * identificação, nome, e-mail, papel, situação, avatar e permissões.
 *
 * Não entram — e não podem entrar — `password` (hash), `googleSub`, `cpf`,
 * `deletedAt`, os dados de consentimento/LGPD e as relações de token
 * (`refreshTokens`, `userSessions`).
 */
const teamListSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  barbershopId: true,
  createdAt: true,
  avatarUrl: true,
  permissions: true,
} as const;

export class UserRepository implements IUserRepository {
  async create(data: ICreateUserDTO): Promise<IUserResponseDTO> {
    return prisma.user.create({ data, select: publicSelect });
  }

  async findById(id: string): Promise<IUserResponseDTO | null> {
    return prisma.user.findUnique({ where: { id }, select: publicSelect });
  }

  async findByEmail(email: string): Promise<IUserResponseDTO | null> {
    const normalized = email.trim().toLowerCase();
    return prisma.user.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
      select: { ...publicSelect, password: true, googleSub: true, emailVerified: true }
    });
  }

  async findByCpf(cpf: string): Promise<IUserResponseDTO | null> {
    return prisma.user.findFirst({ where: { cpf }, select: publicSelect });
  }

  async listActiveByBarbershop(barbershopId: string, ids: string[]): Promise<Array<{ id: string }>> {
    return prisma.user.findMany({
      where: { id: { in: ids }, barbershopId, active: true, role: { in: ["OWNER", "EMPLOYEE"] } },
      select: { id: true },
    });
  }

  async list(
    barbershopId: string,
    query: IListTeamQuery,
  ): Promise<IUserListResult> {
    const { skip, take } = toSkipTake(query.page, query.limit);

    const where = buildUserListWhere(barbershopId, query);
    const orderBy = buildUserListOrderBy(query.sort);

    const [records, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy,
        select: teamListSelect,
      }),
      // `total` conta o conjunto filtrado inteiro, não só a página.
      prisma.user.count({ where }),
    ]);

    const data: IUserListItem[] = records.map((record) => ({
      id: record.id,
      name: record.name,
      email: record.email,
      role: record.role,
      active: record.active,
      barbershopId: record.barbershopId,
      createdAt: record.createdAt,
      avatarUrl: record.avatarUrl,
      permissions: record.permissions,
    }));

    return { data, total };
  }
}
