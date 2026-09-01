import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { ISalonClientRepository } from "../repositories/ISalonClientRepository";
import {
  ICreateSalonClientDTO,
  IUpdateSalonClientDTO,
  ISalonClientListQuery,
  ISalonClientResponseDTO,
} from "../dtos/ISalonClientDTO";

type RequestingUser = { role: string; barbershopId?: string };

function assertShopAccess(
  requestingUser: RequestingUser,
  barbershopId: string
): void {
  if (
    requestingUser.role !== "MASTER_ADMIN" &&
    barbershopId !== requestingUser.barbershopId
  ) {
    throw new AppError("Acesso negado: você não pertence a este salão", 403);
  }
}

@injectable()
export class CreateSalonClientUseCase {
  constructor(
    @inject("SalonClientRepository")
    private repo: ISalonClientRepository
  ) {}

  async execute(
    data: ICreateSalonClientDTO,
    requestingUser: RequestingUser
  ): Promise<ISalonClientResponseDTO> {
    assertShopAccess(requestingUser, data.barbershopId);
    return this.repo.create(data);
  }
}

@injectable()
export class GetSalonClientUseCase {
  constructor(
    @inject("SalonClientRepository")
    private repo: ISalonClientRepository
  ) {}

  async execute(
    id: string,
    requestingUser: RequestingUser
  ): Promise<ISalonClientResponseDTO> {
    const client = await this.repo.findById(id);
    if (!client) throw new AppError("Cliente não encontrado", 404);
    assertShopAccess(requestingUser, client.barbershopId);
    return client;
  }
}

@injectable()
export class ListSalonClientsUseCase {
  constructor(
    @inject("SalonClientRepository")
    private repo: ISalonClientRepository
  ) {}

  async execute(
    query: ISalonClientListQuery & { barbershopId: string },
    requestingUser: RequestingUser
  ): Promise<{ data: ISalonClientResponseDTO[]; total: number }> {
    assertShopAccess(requestingUser, query.barbershopId);
    return this.repo.list(query);
  }
}

@injectable()
export class DeleteSalonClientUseCase {
  constructor(
    @inject("SalonClientRepository")
    private repo: ISalonClientRepository
  ) {}

  async execute(id: string, requestingUser: RequestingUser): Promise<void> {
    const client = await this.repo.findById(id);
    if (!client) throw new AppError("Cliente não encontrado", 404);
    assertShopAccess(requestingUser, client.barbershopId);
    await this.repo.delete(id);
  }
}

@injectable()
export class UpdateSalonClientUseCase {
  constructor(
    @inject("SalonClientRepository")
    private repo: ISalonClientRepository
  ) {}

  async execute(
    id: string,
    data: IUpdateSalonClientDTO,
    requestingUser: RequestingUser
  ): Promise<ISalonClientResponseDTO> {
    const client = await this.repo.findById(id);
    if (!client) throw new AppError("Cliente não encontrado", 404);
    assertShopAccess(requestingUser, client.barbershopId);
    return this.repo.update(id, data);
  }
}
