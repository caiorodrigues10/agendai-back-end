import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IProcedureRecordRepository } from "../../repositories/ProcedureRecordRepository";
import {
  ICreateProcedureRecordDTO,
  IUpdateProcedureRecordDTO,
  IProcedureRecordResponseDTO,
} from "../../dto/IProcedureRecordDTO";

type RequestingUser = { role: string; barbershopId?: string };

function assertShopAccess(user: RequestingUser, barbershopId: string): void {
  if (user.role === "MASTER_ADMIN") return;
  if (user.barbershopId !== barbershopId) {
    throw new AppError("Acesso negado: você não pertence a este salão", 403);
  }
}

function assertStaffRole(user: RequestingUser): void {
  const allowed = ["MASTER_ADMIN", "OWNER", "EMPLOYEE", "ADMIN"];
  if (!allowed.includes(user.role)) {
    throw new AppError("Apenas profissionais do salão podem registrar procedimentos", 403);
  }
}

@injectable()
export class CreateProcedureRecordUseCase {
  constructor(
    @inject("ProcedureRecordRepository")
    private repo: IProcedureRecordRepository
  ) {}

  async execute(
    data: ICreateProcedureRecordDTO,
    requestingUser: RequestingUser
  ): Promise<IProcedureRecordResponseDTO> {
    assertShopAccess(requestingUser, data.barbershopId);
    assertStaffRole(requestingUser);
    return this.repo.create(data);
  }
}

@injectable()
export class ListProcedureRecordsUseCase {
  constructor(
    @inject("ProcedureRecordRepository")
    private repo: IProcedureRecordRepository
  ) {}

  async execute(
    barbershopId: string,
    clientId: string,
    requestingUser: RequestingUser,
    limit?: number
  ): Promise<IProcedureRecordResponseDTO[]> {
    assertShopAccess(requestingUser, barbershopId);
    return this.repo.listByClient(barbershopId, clientId, limit);
  }
}

@injectable()
export class GetLatestProcedureRecordUseCase {
  constructor(
    @inject("ProcedureRecordRepository")
    private repo: IProcedureRecordRepository
  ) {}

  async execute(
    barbershopId: string,
    clientId: string,
    requestingUser: RequestingUser
  ): Promise<IProcedureRecordResponseDTO | null> {
    assertShopAccess(requestingUser, barbershopId);
    return this.repo.getLatestByClient(barbershopId, clientId);
  }
}

@injectable()
export class UpdateProcedureRecordUseCase {
  constructor(
    @inject("ProcedureRecordRepository")
    private repo: IProcedureRecordRepository
  ) {}

  async execute(
    id: string,
    barbershopId: string,
    data: IUpdateProcedureRecordDTO,
    requestingUser: RequestingUser
  ): Promise<IProcedureRecordResponseDTO> {
    assertShopAccess(requestingUser, barbershopId);
    assertStaffRole(requestingUser);
    const existing = await this.repo.findById(id, barbershopId);
    if (!existing) throw new AppError("Registro de procedimento não encontrado", 404);
    return this.repo.update(id, barbershopId, data);
  }
}

@injectable()
export class DeleteProcedureRecordUseCase {
  constructor(
    @inject("ProcedureRecordRepository")
    private repo: IProcedureRecordRepository
  ) {}

  async execute(
    id: string,
    barbershopId: string,
    requestingUser: RequestingUser
  ): Promise<void> {
    assertShopAccess(requestingUser, barbershopId);
    assertStaffRole(requestingUser);
    const existing = await this.repo.findById(id, barbershopId);
    if (!existing) throw new AppError("Registro de procedimento não encontrado", 404);
    await this.repo.delete(id, barbershopId);
  }
}
