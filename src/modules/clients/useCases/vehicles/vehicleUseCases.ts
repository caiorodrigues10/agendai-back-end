import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IClientVehicleRepository } from "../../repositories/ClientVehicleRepository";
import {
  ICreateClientVehicleDTO,
  IUpdateClientVehicleDTO,
  IClientVehicleResponseDTO,
} from "../../dto/IClientVehicleDTO";

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
    throw new AppError("Apenas profissionais do salão podem gerenciar veículos", 403);
  }
}

@injectable()
export class CreateClientVehicleUseCase {
  constructor(
    @inject("ClientVehicleRepository")
    private repo: IClientVehicleRepository
  ) {}

  async execute(
    data: ICreateClientVehicleDTO,
    requestingUser: RequestingUser
  ): Promise<IClientVehicleResponseDTO> {
    assertShopAccess(requestingUser, data.barbershopId);
    assertStaffRole(requestingUser);
    const existing = await this.repo.findByPlate(data.barbershopId, data.clientId, data.plate);
    if (existing) {
      throw new AppError("Este cliente já tem este veículo cadastrado", 409);
    }
    return this.repo.create(data);
  }
}

@injectable()
export class ListClientVehiclesUseCase {
  constructor(
    @inject("ClientVehicleRepository")
    private repo: IClientVehicleRepository
  ) {}

  async execute(
    barbershopId: string,
    clientId: string,
    requestingUser: RequestingUser
  ): Promise<IClientVehicleResponseDTO[]> {
    assertShopAccess(requestingUser, barbershopId);
    return this.repo.listByClient(barbershopId, clientId);
  }
}

@injectable()
export class UpdateClientVehicleUseCase {
  constructor(
    @inject("ClientVehicleRepository")
    private repo: IClientVehicleRepository
  ) {}

  async execute(
    id: string,
    barbershopId: string,
    data: IUpdateClientVehicleDTO,
    requestingUser: RequestingUser
  ): Promise<IClientVehicleResponseDTO> {
    assertShopAccess(requestingUser, barbershopId);
    assertStaffRole(requestingUser);
    const existing = await this.repo.findById(id, barbershopId);
    if (!existing) throw new AppError("Veículo não encontrado", 404);
    if (data.plate && data.plate !== existing.plate) {
      const duplicated = await this.repo.findByPlate(barbershopId, existing.clientId, data.plate);
      if (duplicated && duplicated.id !== id) {
        throw new AppError("Este cliente já tem este veículo cadastrado", 409);
      }
    }
    return this.repo.update(id, barbershopId, data);
  }
}

@injectable()
export class DeleteClientVehicleUseCase {
  constructor(
    @inject("ClientVehicleRepository")
    private repo: IClientVehicleRepository
  ) {}

  async execute(id: string, barbershopId: string, requestingUser: RequestingUser): Promise<void> {
    assertShopAccess(requestingUser, barbershopId);
    assertStaffRole(requestingUser);
    const existing = await this.repo.findById(id, barbershopId);
    if (!existing) throw new AppError("Veículo não encontrado", 404);
    await this.repo.delete(id, barbershopId);
  }
}
