import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IClientPetRepository } from "../../repositories/ClientPetRepository";
import {
  ICreateClientPetDTO,
  IUpdateClientPetDTO,
  IClientPetResponseDTO,
} from "../../dto/IClientPetDTO";

type RequestingUser = { role: string; barbershopId?: string };

function assertShopAccess(user: RequestingUser, barbershopId: string): void {
  if (user.role === "MASTER_ADMIN") return;
  if (user.barbershopId !== barbershopId) {
    throw new AppError("Acesso negado: você não pertence a este salão", 403);
  }
}

function assertStaffRole(user: RequestingUser): void {
  const allowed = ["MASTER_ADMIN", "OWNER", "EMPLOYEE"];
  if (!allowed.includes(user.role)) {
    throw new AppError("Apenas profissionais do salão podem gerenciar pets", 403);
  }
}

@injectable()
export class CreateClientPetUseCase {
  constructor(
    @inject("ClientPetRepository")
    private repo: IClientPetRepository
  ) {}

  async execute(
    data: ICreateClientPetDTO,
    requestingUser: RequestingUser
  ): Promise<IClientPetResponseDTO> {
    assertShopAccess(requestingUser, data.barbershopId);
    assertStaffRole(requestingUser);
    return this.repo.create(data);
  }
}

@injectable()
export class ListClientPetsUseCase {
  constructor(
    @inject("ClientPetRepository")
    private repo: IClientPetRepository
  ) {}

  async execute(
    barbershopId: string,
    clientId: string,
    requestingUser: RequestingUser
  ): Promise<IClientPetResponseDTO[]> {
    assertShopAccess(requestingUser, barbershopId);
    return this.repo.listByClient(barbershopId, clientId);
  }
}

@injectable()
export class UpdateClientPetUseCase {
  constructor(
    @inject("ClientPetRepository")
    private repo: IClientPetRepository
  ) {}

  async execute(
    id: string,
    barbershopId: string,
    data: IUpdateClientPetDTO,
    requestingUser: RequestingUser
  ): Promise<IClientPetResponseDTO> {
    assertShopAccess(requestingUser, barbershopId);
    assertStaffRole(requestingUser);
    const existing = await this.repo.findById(id, barbershopId);
    if (!existing) throw new AppError("Pet não encontrado", 404);
    return this.repo.update(id, barbershopId, data);
  }
}

@injectable()
export class DeleteClientPetUseCase {
  constructor(
    @inject("ClientPetRepository")
    private repo: IClientPetRepository
  ) {}

  async execute(id: string, barbershopId: string, requestingUser: RequestingUser): Promise<void> {
    assertShopAccess(requestingUser, barbershopId);
    assertStaffRole(requestingUser);
    const existing = await this.repo.findById(id, barbershopId);
    if (!existing) throw new AppError("Pet não encontrado", 404);
    await this.repo.delete(id, barbershopId);
  }
}
