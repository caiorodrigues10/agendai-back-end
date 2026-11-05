import { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { ICreateUserDTO } from "@/modules/users/dtos/ICreateUserDTO";
import { IUserResponseDTO } from "@/modules/users/dtos/IUserResponseDTO";
import type {
  IListTeamQuery,
  IUserListItem,
  IUserListResult,
} from "@/modules/users/dtos/IUserListDTO";

export class MockUserRepository implements IUserRepository {
  async listActiveByBarbershop(_barbershopId: string, ids: string[]): Promise<Array<{ id: string }>> {
    return ids.map((id) => ({ id }));
  }
  private data: IUserResponseDTO[] = [];
  private seq = 1;

  async create(payload: ICreateUserDTO): Promise<IUserResponseDTO> {
    const id = `user-${this.seq++}`;
    const now = new Date();
    const role = payload.role ?? "EMPLOYEE";
    const entity: IUserResponseDTO = {
      id,
      name: payload.name,
      email: payload.email,
      role,
      barbershopId: payload.barbershopId ?? null,
      cpf: payload.cpf ?? null,
      createdAt: now,
      active: true
    };
    this.data.push(entity);
    return entity;
  }

  async findById(id: string): Promise<IUserResponseDTO | null> {
    return this.data.find((u) => u.id === id) ?? null;
  }

  async findByEmail(email: string): Promise<IUserResponseDTO | null> {
    const normalized = email.trim().toLowerCase();
    return this.data.find((u) => u.email.toLowerCase() === normalized) ?? null;
  }

  async findByCpf(cpf: string): Promise<IUserResponseDTO | null> {
    return this.data.find((u) => u.cpf === cpf) ?? null;
  }

  /**
   * Insere um membro direto nos testes (com situação, papel e permissões).
   */
  public push(
    member: Partial<IUserResponseDTO> & {
      name: string;
      email: string;
      barbershopId?: string | null;
    },
  ): IUserResponseDTO {
    const created: IUserResponseDTO = {
      id: member.id ?? `user-${this.seq++}`,
      name: member.name,
      email: member.email,
      role: member.role ?? "EMPLOYEE",
      barbershopId: member.barbershopId ?? null,
      cpf: member.cpf ?? null,
      createdAt: member.createdAt ?? new Date(),
      active: member.active ?? true,
      deletedAt: member.deletedAt ?? null,
      avatarUrl: member.avatarUrl ?? null,
      permissions: member.permissions ?? [],
    };
    this.data.push(created);
    return created;
  }

  /**
   * Listagem da equipe em memória.
   *
   * Espelha o `where` do repositório real (`userListWhere.ts`): salão do
   * contexto, membro removido (`deletedAt`) fora, uma cláusula por filtro
   * (busca por nome/e-mail, papel, situação) e ordenação por
   * `nome`/`email`/`cargo`/`criado` com `id` de desempate.
   */
  async list(barbershopId: string, query: IListTeamQuery): Promise<IUserListResult> {
    let results = this.data.filter(
      (u) => u.barbershopId === barbershopId && !u.deletedAt,
    );

    if (query.search) {
      const term = query.search.toLowerCase();
      results = results.filter(
        (u) =>
          u.name.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term),
      );
    }

    if (query.role) {
      results = results.filter((u) => u.role === query.role);
    }

    if (typeof query.active === "boolean") {
      results = results.filter((u) => u.active === query.active);
    }

    const dir = query.sort?.dir ?? "asc";
    const field = query.sort?.field;
    const sorted = [...results].sort((a, b) => {
      let cmp = 0;

      if (field === "nome") {
        cmp = a.name.localeCompare(b.name);
      } else if (field === "email") {
        cmp = a.email.localeCompare(b.email);
      } else if (field === "cargo") {
        cmp = a.role.localeCompare(b.role);
      } else {
        cmp = a.createdAt.getTime() - b.createdAt.getTime();
      }

      if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      return dir === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    });

    const total = sorted.length;
    const start = (query.page - 1) * query.limit;
    const page = sorted.slice(start, start + query.limit);

    const data: IUserListItem[] = page.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as IUserListItem["role"],
      active: u.active,
      barbershopId: u.barbershopId ?? null,
      createdAt: u.createdAt,
      avatarUrl: u.avatarUrl ?? null,
      permissions: u.permissions ?? [],
    }));

    return { data, total };
  }
}
