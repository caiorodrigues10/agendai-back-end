import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import { IClientCaseRepository } from "../../repositories/ClientCaseRepository";
import {
  ICreateClientCaseDTO,
  IUpdateClientCaseDTO,
  IClientCaseResponseDTO,
} from "../../dto/IClientCaseDTO";
import { CaseBacklogRepository } from "@/modules/cases/repositories/CaseBacklogRepository";

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
    throw new AppError("Apenas profissionais do salão podem gerenciar casos", 403);
  }
}

@injectable()
export class CreateClientCaseUseCase {
  constructor(
    @inject("ClientCaseRepository")
    private repo: IClientCaseRepository
  ) {}

  async execute(
    data: ICreateClientCaseDTO,
    requestingUser: RequestingUser
  ): Promise<IClientCaseResponseDTO> {
    assertShopAccess(requestingUser, data.barbershopId);
    assertStaffRole(requestingUser);
    return this.repo.create(data);
  }
}

@injectable()
export class ListClientCasesUseCase {
  constructor(
    @inject("ClientCaseRepository")
    private repo: IClientCaseRepository
  ) {}

  async execute(
    barbershopId: string,
    clientId: string,
    requestingUser: RequestingUser
  ): Promise<IClientCaseResponseDTO[]> {
    assertShopAccess(requestingUser, barbershopId);
    return this.repo.listByClient(barbershopId, clientId);
  }
}

@injectable()
export class UpdateClientCaseUseCase {
  constructor(
    @inject("ClientCaseRepository")
    private repo: IClientCaseRepository,
    @inject("CaseBacklogRepository")
    private backlogRepository: CaseBacklogRepository
  ) {}

  async execute(
    id: string,
    barbershopId: string,
    data: IUpdateClientCaseDTO,
    requestingUser: RequestingUser
  ): Promise<IClientCaseResponseDTO> {
    assertShopAccess(requestingUser, barbershopId);
    assertStaffRole(requestingUser);
    const existing = await this.repo.findById(id, barbershopId);
    if (!existing) throw new AppError("Caso não encontrado", 404);

    const updated = await this.repo.update(id, barbershopId, data);

    // O honorário de êxito é derivado do valor obtido no caso: quando ele
    // muda, os honorários do caso precisam ser recalculados.
    if (data.awardedAmount !== undefined) {
      const logger = getModuleLogger("client-cases");
      try {
        await this.backlogRepository.recalculateSuccessFeesForCase(barbershopId, id);
      } catch (error) {
        logger.warn(
          { err: error, caseId: id, barbershopId },
          "Falha ao recalcular honorários de êxito do caso"
        );
      }
    }

    return updated;
  }
}

@injectable()
export class DeleteClientCaseUseCase {
  constructor(
    @inject("ClientCaseRepository")
    private repo: IClientCaseRepository
  ) {}

  async execute(id: string, barbershopId: string, requestingUser: RequestingUser): Promise<void> {
    assertShopAccess(requestingUser, barbershopId);
    assertStaffRole(requestingUser);
    const existing = await this.repo.findById(id, barbershopId);
    if (!existing) throw new AppError("Caso não encontrado", 404);
    await this.repo.delete(id, barbershopId);
  }
}
