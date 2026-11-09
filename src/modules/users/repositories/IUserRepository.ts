import { ICreateUserDTO } from "../dtos/ICreateUserDTO";
import { IUserResponseDTO } from "../dtos/IUserResponseDTO";
import type { IListTeamQuery, IUserListResult } from "../dtos/IUserListDTO";

export interface IUserRepository {
  create(data: ICreateUserDTO): Promise<IUserResponseDTO>;
  findById(id: string): Promise<IUserResponseDTO | null>;
  findByEmail(email: string): Promise<IUserResponseDTO | null>;
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
