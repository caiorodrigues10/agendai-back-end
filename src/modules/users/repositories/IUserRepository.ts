import { ICreateUserDTO } from "../dtos/ICreateUserDTO";
import { IUserResponseDTO } from "../dtos/IUserResponseDTO";
import type { IListTeamQuery, IUserListResult } from "../dtos/IUserListDTO";

export interface IUserRepository {
  create(data: ICreateUserDTO): Promise<IUserResponseDTO>;
  findById(id: string): Promise<IUserResponseDTO | null>;
  /**
   * Busca por e-mail ignorando maiúsculas/minúsculas.
   *
   * Soft delete corta aqui: usuário com `deletedAt` preenchido NÃO é
   * retornado (login por senha e login Google dependem disso).
   */
  findByEmail(email: string): Promise<IUserResponseDTO | null>;
  /**
   * Igual a `findByEmail`, mas inclui usuários com `deletedAt` preenchido.
   *
   * Só para checagem de duplicidade na criação de usuário: o índice único de
   * `email` no banco continua reservando o e-mail de quem foi removido, então
   * o aviso "E-mail já cadastrado" precisa enxergar o registro apagado.
   */
  findByEmailIncludingDeleted(email: string): Promise<IUserResponseDTO | null>;
  /** Busca por CPF normalizado (somente dígitos). */
  findByCpf(cpf: string): Promise<IUserResponseDTO | null>;
  listActiveByBarbershop(barbershopId: string, ids: string[]): Promise<Array<{ id: string }>>;
  /**
   * Listagem paginada da equipe do dono.
   *
   * `barbershopId` é sempre o salão do contexto — nenhum filtro da query
   * troca o salão. Membros removidos (`deletedAt`) não aparecem.
   */
  list(barbershopId: string, query: IListTeamQuery): Promise<IUserListResult>;
}
