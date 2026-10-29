import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { CaseBacklogRepository } from "../repositories/CaseBacklogRepository";
import { parseIntimationText } from "../utils/intimationParser";
import { getFeeInvoiceAdapter } from "../utils/feeInvoiceProviders";
import type {
  ICaseFeeInvoiceDTO,
  ICaseSuccessFeeDTO,
  ICaseTimeEntryDTO,
  ICaseTransferDTO,
  ICourtIntimationDTO,
  ITimeEntrySummaryDTO,
} from "../dto/ICaseExtendedDTOs";
import type {
  CreateFeeInvoiceInput,
  CreateIntimationInput,
  CreateSuccessFeeInput,
  CreateTimeEntryInput,
  CreateTransferInput,
  ImportIntimationsInput,
  IssueFeeInvoiceInput,
  RespondTransferInput,
  TriageIntimationInput,
  UpdateFeeInvoiceInput,
  UpdateSuccessFeeInput,
  UpdateTimeEntryInput,
} from "../schemas/caseBacklogSchemas";
import type { RequestingUser } from "./caseManagementUseCases";

const STAFF_ROLES = ["MASTER_ADMIN", "OWNER", "EMPLOYEE"];

function assertShopAccess(user: RequestingUser, barbershopId: string): void {
  if (user.role === "MASTER_ADMIN") return;
  if (!user.barbershopId || user.barbershopId !== barbershopId) {
    throw new AppError(
      "Acesso negado: você não pertence a este escritório",
      403
    );
  }
}

function assertStaffRole(user: RequestingUser): void {
  if (!STAFF_ROLES.includes(user.role)) {
    throw new AppError(
      "Apenas profissionais do escritório podem gerenciar processos",
      403
    );
  }
}

/**
 * Timesheet — horas trabalhadas no caso.
 *
 * O valor é derivado (minutos/60 × valor/hora); o escritório não digita
 * valor total, evitando divergência entre lançamento e cobrança.
 */
@injectable()
export class CreateTimeEntryUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    input: CreateTimeEntryInput,
    user: RequestingUser,
  ): Promise<ICaseTimeEntryDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const theCase = await this.repository.findCaseClient(barbershopId, caseId);
    if (!theCase) {
      throw new AppError("Caso não encontrado", 404);
    }

    return this.repository.createTimeEntry({
      barbershopId,
      caseId,
      clientId: theCase.clientId,
      staffUserId: input.staffUserId,
      description: input.description ?? null,
      minutes: input.minutes,
      billable: input.billable,
      hourlyRate: input.hourlyRate ?? null,
      entryDate: input.entryDate,
    });
  }
}

@injectable()
export class ListTimeEntriesUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    filters: { caseId?: string; staffUserId?: string; billed?: boolean; limit?: number },
    user: RequestingUser,
  ): Promise<ICaseTimeEntryDTO[]> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);
    return this.repository.listTimeEntries(barbershopId, filters);
  }
}

@injectable()
export class UpdateTimeEntryUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    entryId: string,
    input: UpdateTimeEntryInput,
    user: RequestingUser,
  ): Promise<ICaseTimeEntryDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    return this.repository.updateTimeEntry(barbershopId, entryId, {
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.minutes !== undefined ? { minutes: input.minutes } : {}),
      ...(input.billable !== undefined ? { billable: input.billable } : {}),
      ...(input.hourlyRate !== undefined ? { hourlyRate: input.hourlyRate } : {}),
      ...(input.billed !== undefined ? { billed: input.billed } : {}),
      ...(input.entryDate !== undefined ? { entryDate: input.entryDate } : {}),
    });
  }
}

@injectable()
export class DeleteTimeEntryUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    entryId: string,
    user: RequestingUser
  ): Promise<void> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);
    await this.repository.deleteTimeEntry(barbershopId, entryId);
  }
}

/** Resumo do timesheet do caso (total de horas e valor a faturar). */
@injectable()
export class SummarizeTimeEntriesUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    user: RequestingUser,
  ): Promise<ITimeEntrySummaryDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);
    return this.repository.summarizeTimeEntries(barbershopId, caseId);
  }
}

/**
 * Honorários de êxito — percentual sobre o valor obtido no caso.
 *
 * O valor é recalculado a partir do `awardedAmount` do caso; o escritório
 * informa o percentual e o sistema calcula (nunca digita o valor final).
 */
@injectable()
export class CreateSuccessFeeUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    input: CreateSuccessFeeInput,
    user: RequestingUser,
  ): Promise<ICaseSuccessFeeDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const theCase = await this.repository.findCaseClient(barbershopId, caseId);
    if (!theCase) {
      throw new AppError("Caso não encontrado", 404);
    }

    const created = await this.repository.createSuccessFee({
      barbershopId,
      caseId,
      percent: input.percent,
      installments: input.installments,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
    });

    return (await this.repository.recalculateSuccessFee(barbershopId, created.id)) ?? created;
  }
}

@injectable()
export class ListSuccessFeesUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    filters: { caseId?: string; status?: "PENDING" | "INVOICED" | "PAID" | "CANCELED"; limit?: number },
    user: RequestingUser,
  ): Promise<ICaseSuccessFeeDTO[]> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);
    return this.repository.listSuccessFees(barbershopId, filters);
  }
}

@injectable()
export class UpdateSuccessFeeUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    feeId: string,
    input: UpdateSuccessFeeInput,
    user: RequestingUser,
  ): Promise<ICaseSuccessFeeDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const existing = await this.repository.findSuccessFee(barbershopId, feeId);
    if (!existing) {
      throw new AppError("Honorário não encontrado", 404);
    }

    const updated = await this.repository.updateSuccessFee(barbershopId, feeId, {
      ...(input.percent !== undefined ? { percent: input.percent } : {}),
      ...(input.installments !== undefined ? { installments: input.installments } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });

    if (input.percent !== undefined) {
      return (await this.repository.recalculateSuccessFee(barbershopId, feeId)) ?? updated;
    }
    return updated;
  }
}

/**
 * Digestão de intimações.
 *
 * O escritório cola o texto da intimação (email do tribunal, notificação do
 * PJe, tabela de movimentações). O parser extrai o número do processo e
 * sugere o tipo do andamento; a triagem confirma o caso e gera o andamento.
 */
@injectable()
export class CreateIntimationUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    input: CreateIntimationInput,
    user: RequestingUser,
  ): Promise<ICourtIntimationDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const parsed = parseIntimationText(`${input.subject}\n${input.body}`);

    return this.repository.createIntimation({
      barbershopId,
      source: input.source ?? "MANUAL",
      receivedAt: input.receivedAt,
      subject: input.subject,
      body: input.body,
      detectedNumber: input.detectedNumber ?? parsed[0]?.detectedNumber ?? null,
      suggestedType: parsed[0]?.suggestedType ?? "INTIMATION",
    });
  }
}

/** Importação em lote de intimações (texto colado do PJe/DJ). */
@injectable()
export class ImportIntimationsUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    input: ImportIntimationsInput,
    user: RequestingUser,
  ): Promise<{ imported: number; intimations: ICourtIntimationDTO[] }> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const parsed = parseIntimationText(input.text);
    if (parsed.length === 0) {
      throw new AppError("Nenhuma intimação reconhecida no texto informado", 400);
    }

    const created: ICourtIntimationDTO[] = [];
    for (const item of parsed) {
      const intimation = await this.repository.createIntimation({
        barbershopId,
        source: input.source ?? "IMPORT",
        subject: item.subject,
        body: item.body,
        detectedNumber: item.detectedNumber,
        suggestedType: item.suggestedType,
      });
      created.push(intimation);
    }

    return { imported: created.length, intimations: created };
  }
}

@injectable()
export class ListIntimationsUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    filters: { status?: "NEW" | "TRIAGED" | "LINKED" | "IGNORED"; caseId?: string; limit?: number },
    user: RequestingUser,
  ): Promise<ICourtIntimationDTO[]> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);
    return this.repository.listIntimations(barbershopId, filters);
  }
}

/**
 * Triagem da intimação: vincular ao caso, ignorar ou apenas marcar como
 * revisada. Quando `createEvent` é true, gera o andamento no caso.
 */
@injectable()
export class TriageIntimationUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    intimationId: string,
    input: TriageIntimationInput,
    createEvent: (args: {
      caseId: string;
      title: string;
      description?: string | null;
      type: "NOTE" | "MEETING" | "FILING" | "COURT_MOTION" | "DEADLINE" | "INTIMATION" | "PAYMENT" | "CLIENT_CONTACT";
      occurredAt: Date;
      visibleToClient: boolean;
    }) => Promise<string>,
    user: RequestingUser,
  ): Promise<ICourtIntimationDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const intimation = await this.repository.findIntimation(barbershopId, intimationId);
    if (!intimation) {
      throw new AppError("Intimação não encontrada", 404);
    }

    let caseId = input.caseId !== undefined ? input.caseId : intimation.caseId;

    // Sem caso informado, tenta casar pelo número CNJ detectado.
    if (!caseId && intimation.detectedNumber) {
      const matched = await this.repository.findCaseByNumber(
        barbershopId,
        intimation.detectedNumber
      );
      caseId = matched?.id ?? null;
    }

    if (caseId) {
      const theCase = await this.repository.findCaseClient(barbershopId, caseId);
      if (!theCase) {
        throw new AppError("Caso não encontrado", 404);
      }
    }

    let linkedEventId = intimation.linkedEventId;
    if (input.createEvent && caseId) {
      linkedEventId = await createEvent({
        caseId,
        title: input.eventTitle?.trim() || intimation.subject,
        description: intimation.body,
        type: input.suggestedType ?? intimation.suggestedType,
        occurredAt: intimation.receivedAt,
        visibleToClient: input.visibleToClient ?? false,
      });
    }

    const status =
      input.status ??
      (caseId ? (linkedEventId ? "LINKED" : "TRIAGED") : "TRIAGED");

    return this.repository.updateIntimation(barbershopId, intimationId, {
      caseId: caseId ?? null,
      status,
      suggestedType: input.suggestedType ?? intimation.suggestedType,
      triagedByUserId: user.id ?? null,
      triagedAt: new Date(),
      linkedEventId: linkedEventId ?? null,
    });
  }
}

/**
 * NFS-e do escritório.
 *
 * Emissão manual (número digitado) funciona sem credenciais; os provedores
 * externos exigem token na env e falham com mensagem clara quando ausente.
 */
@injectable()
export class CreateFeeInvoiceUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    input: CreateFeeInvoiceInput,
    user: RequestingUser,
  ): Promise<ICaseFeeInvoiceDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    if (input.caseId) {
      const theCase = await this.repository.findCaseClient(barbershopId, input.caseId);
      if (!theCase) {
        throw new AppError("Caso não encontrado", 404);
      }
    }

    return this.repository.createFeeInvoice({
      barbershopId,
      caseId: input.caseId ?? null,
      clientId: input.clientId ?? null,
      description: input.description,
      amount: input.amount,
      issRetained: input.issRetained,
      taxpayerId: input.taxpayerId ?? null,
      provider: input.provider ?? "MANUAL",
      invoiceNumber: input.invoiceNumber ?? null,
      createdByUserId: user.id ?? null,
    });
  }
}

@injectable()
export class ListFeeInvoicesUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    filters: { caseId?: string; status?: "DRAFT" | "ISSUED" | "CANCELED" | "FAILED"; limit?: number },
    user: RequestingUser,
  ): Promise<ICaseFeeInvoiceDTO[]> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);
    return this.repository.listFeeInvoices(barbershopId, filters);
  }
}

@injectable()
export class UpdateFeeInvoiceUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    invoiceId: string,
    input: UpdateFeeInvoiceInput,
    user: RequestingUser,
  ): Promise<ICaseFeeInvoiceDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const existing = await this.repository.findFeeInvoice(barbershopId, invoiceId);
    if (!existing) {
      throw new AppError("Nota fiscal não encontrada", 404);
    }

    return this.repository.updateFeeInvoice(barbershopId, invoiceId, {
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.invoiceNumber !== undefined ? { invoiceNumber: input.invoiceNumber } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.issRetained !== undefined ? { issRetained: input.issRetained } : {}),
      ...(input.taxpayerId !== undefined ? { taxpayerId: input.taxpayerId } : {}),
    });
  }
}

/** Emissão da NFS-e (manual ou via provedor configurado). */
@injectable()
export class IssueFeeInvoiceUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    invoiceId: string,
    input: IssueFeeInvoiceInput,
    user: RequestingUser,
  ): Promise<ICaseFeeInvoiceDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const invoice = await this.repository.findFeeInvoice(barbershopId, invoiceId);
    if (!invoice) {
      throw new AppError("Nota fiscal não encontrada", 404);
    }
    if (invoice.status === "ISSUED") {
      throw new AppError("Nota fiscal já emitida", 409);
    }

    const adapter = getFeeInvoiceAdapter(invoice.provider);

    try {
      const result = await adapter.issue({
        description: invoice.description,
        amount: invoice.amount,
        taxpayerId: invoice.taxpayerId,
        invoiceNumber: input.invoiceNumber ?? invoice.invoiceNumber,
      });

      return this.repository.updateFeeInvoice(barbershopId, invoiceId, {
        status: "ISSUED",
        issuedAt: new Date(),
        invoiceNumber: result.invoiceNumber ?? invoice.invoiceNumber,
        externalId: result.externalId ?? invoice.externalId,
        xmlUrl: result.xmlUrl ?? input.xmlUrl ?? invoice.xmlUrl,
        errorMessage: null,
      });
    } catch (error) {
      await this.repository.updateFeeInvoice(barbershopId, invoiceId, {
        status: "FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Falha ao emitir a nota fiscal",
      });
      throw error;
    }
  }
}

/**
 * Transferência de caso entre unidades (multiunidade).
 *
 * Só é possível transferir para uma unidade irmã (mesma organização) e o
 * aceite é feito por quem responde pela unidade de destino.
 */
@injectable()
export class CreateCaseTransferUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    caseId: string,
    input: CreateTransferInput,
    user: RequestingUser,
  ): Promise<ICaseTransferDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const theCase = await this.repository.findCaseClient(barbershopId, caseId);
    if (!theCase) {
      throw new AppError("Caso não encontrado", 404);
    }

    if (input.targetBarbershopId === barbershopId) {
      throw new AppError("A unidade de destino deve ser diferente da atual", 400);
    }

    const siblings = await this.repository.listSiblingShops(barbershopId);
    const target = siblings.find((s) => s.id === input.targetBarbershopId);
    if (!target) {
      throw new AppError(
        "Unidade de destino inválida: escolha outra unidade da mesma organização",
        400
      );
    }

    const pending = await this.repository.listTransfers(barbershopId, {
      status: "PENDING",
      role: "origin",
    });
    if (pending.some((t) => t.caseId === caseId)) {
      throw new AppError("Já existe uma transferência pendente para este caso", 409);
    }

    return this.repository.createTransfer({
      barbershopId,
      caseId,
      targetBarbershopId: input.targetBarbershopId,
      reason: input.reason ?? null,
      requestedByUserId: user.id ?? "",
    });
  }
}

/**
 * Unidades irmãs disponíveis para transferência (mesma organização).
 */
@injectable()
export class ListSiblingShopsUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    user: RequestingUser
  ): Promise<Array<{ id: string; name: string }>> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);
    return this.repository.listSiblingShops(barbershopId);
  }
}

@injectable()
export class ListCaseTransfersUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    filters: { status?: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELED"; role?: "origin" | "target"; limit?: number },
    user: RequestingUser,
  ): Promise<ICaseTransferDTO[]> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);
    return this.repository.listTransfers(barbershopId, filters);
  }
}

/** Aceite (move o caso) ou recusa da transferência. */
@injectable()
export class RespondCaseTransferUseCase {
  constructor(
    @inject("CaseBacklogRepository")
    private readonly repository: CaseBacklogRepository
  ) {}

  async execute(
    barbershopId: string,
    transferId: string,
    input: RespondTransferInput,
    user: RequestingUser,
  ): Promise<ICaseTransferDTO> {
    assertStaffRole(user);
    assertShopAccess(user, barbershopId);

    const transfer = await this.repository.findTransfer(barbershopId, transferId);
    if (!transfer) {
      throw new AppError("Transferência não encontrada", 404);
    }
    if (transfer.status !== "PENDING") {
      throw new AppError("Transferência já respondida", 409);
    }
    if (transfer.targetBarbershopId !== barbershopId) {
      throw new AppError(
        "Somente a unidade de destino pode responder a transferência",
        403
      );
    }

    if (input.decision === "REJECTED") {
      return this.repository.updateTransfer(barbershopId, transferId, {
        status: "REJECTED",
        acceptedByUserId: user.id ?? null,
        acceptedAt: new Date(),
        reason: input.reason ?? transfer.reason,
      });
    }

    await this.repository.moveCaseToShop(
      transfer.caseId,
      transfer.barbershopId,
      transfer.targetBarbershopId
    );

    return this.repository.updateTransfer(barbershopId, transferId, {
      status: "ACCEPTED",
      acceptedByUserId: user.id ?? null,
      acceptedAt: new Date(),
      reason: input.reason ?? transfer.reason,
    });
  }
}
