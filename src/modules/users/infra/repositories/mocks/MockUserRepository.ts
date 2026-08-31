import { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { ICreateUserDTO } from "@/modules/users/dtos/ICreateUserDTO";
import { IUserResponseDTO } from "@/modules/users/dtos/IUserResponseDTO";

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
}
