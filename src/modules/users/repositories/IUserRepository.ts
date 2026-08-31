import { ICreateUserDTO } from "../dtos/ICreateUserDTO";
import { IUserResponseDTO } from "../dtos/IUserResponseDTO";

export interface IUserRepository {
  create(data: ICreateUserDTO): Promise<IUserResponseDTO>;
  findById(id: string): Promise<IUserResponseDTO | null>;
  findByEmail(email: string): Promise<IUserResponseDTO | null>;
  /** Busca por CPF normalizado (somente dígitos). */
  findByCpf(cpf: string): Promise<IUserResponseDTO | null>;
  listActiveByBarbershop(barbershopId: string, ids: string[]): Promise<Array<{ id: string }>>;
}
