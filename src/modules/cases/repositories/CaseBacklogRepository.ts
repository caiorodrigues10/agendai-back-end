import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import type {
  CaseEventType,
  CaseTransferStatus,
  ContractStatus,
  ContractType,
  FeeInvoiceProvider,
  FeeInvoiceStatus,
  IntimationSource,
  IntimationStatus,
  Prisma,
  SignatureRole,
  SignatureStatus,
  SignatureType,
  SuccessFeeStatus,
} from "@prisma/client";
import type {
  ICaseContractDTO,
  ICaseFeeInvoiceDTO,
  ICaseSuccessFeeDTO,
  ICaseTimeEntryDTO,
  ICaseTransferDTO,
  ICourtIntimationDTO,
  IContractSignatureDTO,
  IDeadlineAlertDTO,
  ITimeEntrySummaryDTO,
} from "../dto/ICaseExtendedDTOs";

/**
 * Repositório do backlog de gestão de processos.
 *
 * Concentra as tabelas novas: contratos, assinaturas, timesheet, honorários
 * de êxito, intimações, NFS-e, alertas de prazo e transferências. O
 * isolamento é por `barbershopId` em todas as queries (a RLS é a segunda
 * rede de proteção).
 */

function toNumber(value: { toString(): string } | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" ? value : Number(value.toString());
}

function toToken(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 16);
}

// ─── Includes tipados por interface local (não usar Prisma.*GetPayload) ──────

const contractInclude = {
  client: { select: { id: true, name: true } },
  signatures: { orderBy: { createdAt: "asc" as const } },
};

interface ContractWithContext {
  id: string;
  barbershopId: string;
  caseId: string;
  clientId: string;
  client: { id: string; name: string };
  title: string;
  type: ContractType;
  status: ContractStatus;
  content: string | null;
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  version: number;
  value: { toString(): string } | number | null;
  feePercent: { toString(): string } | number | null;
  notes: string | null;
  signedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  signatures: SignatureWithContext[];
}

interface SignatureWithContext {
  id: string;
  barbershopId: string;
  contractId: string;
  signerName: string;
  signerEmail: string | null;
  signerWhatsapp: string | null;
  role: SignatureRole;
  status: SignatureStatus;
  token: string;
  signatureUrl: string | null;
  signatureType: SignatureType;
  signedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const timeEntryInclude = {
  staffUser: { select: { id: true, name: true } },
};

interface TimeEntryWithContext {
  id: string;
  barbershopId: string;
  caseId: string;
  clientId: string;
  staffUserId: string;
  staffUser: { id: string; name: string };
  description: string | null;
  minutes: number;
  billable: boolean;
  hourlyRate: { toString(): string } | number | null;
  billed: boolean;
  entryDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const successFeeInclude = { case: { select: { id: true, nickname: true } } };

interface SuccessFeeWithContext {
  id: string;
  barbershopId: string;
  caseId: string;
  case: { id: string; nickname: string };
  percent: { toString(): string } | number;
  baseAmount: { toString(): string } | number | null;
  amount: { toString(): string } | number | null;
  installments: number;
  status: SuccessFeeStatus;
  dueDate: Date | null;
  paidAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const intimationInclude = { case: { select: { id: true, nickname: true } } };

interface IntimationWithContext {
  id: string;
  barbershopId: string;
  caseId: string | null;
  case: { id: string; nickname: string } | null;
  source: IntimationSource;
  receivedAt: Date;
  subject: string;
  body: string;
  detectedNumber: string | null;
  suggestedType: CaseEventType;
  status: IntimationStatus;
  triagedAt: Date | null;
  linkedEventId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const transferInclude = {
  barbershop: { select: { id: true, name: true } },
  targetBarbershop: { select: { id: true, name: true } },
  case: { select: { id: true, nickname: true } },
};

interface TransferWithContext {
  id: string;
  barbershopId: string;
  barbershop: { id: string; name: string };
  caseId: string;
  case: { id: string; nickname: string };
  targetBarbershopId: string;
  targetBarbershop: { id: string; name: string };
  reason: string | null;
  status: CaseTransferStatus;
  requestedByUserId: string;
  acceptedByUserId: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const deadlineAlertInclude = {
  deadline: { select: { id: true, title: true } },
};

interface DeadlineAlertWithContext {
  id: string;
  barbershopId: string;
  deadlineId: string;
  deadline: { id: string; title: string };
  userId: string;
  channel: "WHATSAPP" | "EMAIL";
  kind: "UPCOMING" | "OVERDUE";
  daysRemaining: number | null;
  sentOn: Date;
  status: "PENDING" | "SENT" | "FAILED" | "CANCELED";
  sentAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

export class CaseBacklogRepository {
  /**
   * Dados básicos do caso para validar vínculo e resolver o cliente.
   * Devolve null quando o caso não pertence ao escritório informado.
   */
  async findCaseClient(
    barbershopId: string,
    caseId: string
  ): Promise<{ id: string; clientId: string; nickname: string } | null> {
    const found = await prisma.clientCase.findFirst({
      where: { id: caseId, barbershopId },
      select: { id: true, clientId: true, nickname: true },
    });
    return found;
  }

  // ─── Contratos ────────────────────────────────────────────────────────────

  async createContract(data: {
    barbershopId: string;
    caseId: string;
    clientId: string;
    title: string;
    type: ContractType;
    content?: string | null;
    value?: number | null;
    feePercent?: number | null;
    notes?: string | null;
    createdByUserId?: string | null;
    signers?: Array<{
      signerName: string;
      signerEmail?: string | null;
      signerWhatsapp?: string | null;
      role?: SignatureRole;
    }>;
  }): Promise<ICaseContractDTO> {
    const created = (await prisma.caseContract.create({
      data: {
        barbershopId: data.barbershopId,
        caseId: data.caseId,
        clientId: data.clientId,
        title: data.title,
        type: data.type,
        content: data.content ?? null,
        value: data.value ?? null,
        feePercent: data.feePercent ?? null,
        notes: data.notes ?? null,
        createdByUserId: data.createdByUserId ?? null,
        ...(data.signers && data.signers.length > 0
          ? {
              signatures: {
                create: data.signers.map((s) => ({
                  barbershopId: data.barbershopId,
                  signerName: s.signerName,
                  signerEmail: s.signerEmail ?? null,
                  signerWhatsapp: s.signerWhatsapp ?? null,
                  role: s.role ?? ("CLIENT" as SignatureRole),
                  token: toToken(),
                })),
              },
            }
          : {}),
      },
      include: contractInclude,
    })) as unknown as ContractWithContext;

    return this.mapContract(created);
  }

  async findContract(
    barbershopId: string,
    contractId: string
  ): Promise<ICaseContractDTO | null> {
    const found = (await prisma.caseContract.findFirst({
      where: { id: contractId, barbershopId },
      include: contractInclude,
    })) as unknown as ContractWithContext | null;
    return found ? this.mapContract(found) : null;
  }

  async listContracts(
    barbershopId: string,
    filters: { caseId?: string; status?: ContractStatus; limit?: number }
  ): Promise<ICaseContractDTO[]> {
    const rows = (await prisma.caseContract.findMany({
      where: {
        barbershopId,
        ...(filters.caseId ? { caseId: filters.caseId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: contractInclude,
      orderBy: { updatedAt: "desc" },
      take: filters.limit ?? 100,
    })) as unknown as ContractWithContext[];
    return rows.map((r) => this.mapContract(r));
  }

  async updateContract(
    barbershopId: string,
    contractId: string,
    data: Partial<{
      title: string;
      content: string | null;
      value: number | null;
      feePercent: number | null;
      notes: string | null;
      status: ContractStatus;
      fileUrl: string | null;
      fileName: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
      signedAt: Date | null;
      version: number;
    }>
  ): Promise<ICaseContractDTO> {
    const updated = (await prisma.caseContract.update({
      where: { id: contractId, barbershopId },
      data,
      include: contractInclude,
    })) as unknown as ContractWithContext;
    return this.mapContract(updated);
  }

  async deleteContract(barbershopId: string, contractId: string): Promise<void> {
    await prisma.caseContract.delete({ where: { id: contractId, barbershopId } });
  }

  // ─── Assinaturas ──────────────────────────────────────────────────────────

  async addSignature(data: {
    barbershopId: string;
    contractId: string;
    signerName: string;
    signerEmail?: string | null;
    signerWhatsapp?: string | null;
    role?: SignatureRole;
  }): Promise<IContractSignatureDTO> {
    const created = await prisma.contractSignature.create({
      data: {
        barbershopId: data.barbershopId,
        contractId: data.contractId,
        signerName: data.signerName,
        signerEmail: data.signerEmail ?? null,
        signerWhatsapp: data.signerWhatsapp ?? null,
        role: data.role ?? "CLIENT",
        token: toToken(),
      },
    });
    return this.mapSignature(created);
  }

  async findSignatureByToken(token: string): Promise<IContractSignatureDTO | null> {
    const found = await prisma.contractSignature.findUnique({ where: { token } });
    return found ? this.mapSignature(found) : null;
  }

  async listSignatures(
    barbershopId: string,
    contractId: string
  ): Promise<IContractSignatureDTO[]> {
    const rows = await prisma.contractSignature.findMany({
      where: { barbershopId, contractId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => this.mapSignature(r));
  }

  async updateSignature(
    signatureId: string,
    data: Partial<{
      status: SignatureStatus;
      signatureUrl: string | null;
      signatureType: SignatureType;
      signedAt: Date | null;
    }>
  ): Promise<IContractSignatureDTO> {
    const updated = await prisma.contractSignature.update({
      where: { id: signatureId },
      data,
    });
    return this.mapSignature(updated);
  }

  async deleteSignature(barbershopId: string, signatureId: string): Promise<void> {
    await prisma.contractSignature.delete({
      where: { id: signatureId, barbershopId },
    });
  }

  /**
   * Recalcula o status do contrato a partir das assinaturas:
   * todas assinadas → SIGNED (+ signedAt); alguma assinada →
   * PARTIALLY_SIGNED; nenhuma → volta para SENT (ou DRAFT se nunca enviado).
   */
  async refreshContractStatus(
    barbershopId: string,
    contractId: string
  ): Promise<ICaseContractDTO | null> {
    const signatures = await prisma.contractSignature.findMany({
      where: { contractId },
    });
    const contract = await prisma.caseContract.findFirst({
      where: { id: contractId, barbershopId },
    });
    if (!contract) return null;

    if (signatures.length === 0) {
      return this.updateContract(barbershopId, contractId, { status: "DRAFT" });
    }

    const allSigned = signatures.every((s) => s.status === "SIGNED");
    if (allSigned) {
      return this.updateContract(barbershopId, contractId, {
        status: "SIGNED",
        signedAt: signatures.reduce<Date>(
          (max, s) => (s.signedAt && s.signedAt > max ? s.signedAt : max),
          new Date(0)
        ),
      });
    }

    const anySigned = signatures.some((s) => s.status === "SIGNED");
    return this.updateContract(barbershopId, contractId, {
      status: anySigned ? "PARTIALLY_SIGNED" : contract.status,
    });
  }

  // ─── Timesheet ────────────────────────────────────────────────────────────

  async createTimeEntry(data: {
    barbershopId: string;
    caseId: string;
    clientId: string;
    staffUserId: string;
    description?: string | null;
    minutes: number;
    billable?: boolean;
    hourlyRate?: number | null;
    entryDate?: Date;
  }): Promise<ICaseTimeEntryDTO> {
    const created = (await prisma.caseTimeEntry.create({
      data: {
        barbershopId: data.barbershopId,
        caseId: data.caseId,
        clientId: data.clientId,
        staffUserId: data.staffUserId,
        description: data.description ?? null,
        minutes: data.minutes,
        billable: data.billable ?? true,
        hourlyRate: data.hourlyRate ?? null,
        entryDate: data.entryDate ?? new Date(),
      },
      include: timeEntryInclude,
    })) as unknown as TimeEntryWithContext;
    return this.mapTimeEntry(created);
  }

  async listTimeEntries(
    barbershopId: string,
    filters: { caseId?: string; staffUserId?: string; billed?: boolean; limit?: number }
  ): Promise<ICaseTimeEntryDTO[]> {
    const rows = (await prisma.caseTimeEntry.findMany({
      where: {
        barbershopId,
        ...(filters.caseId ? { caseId: filters.caseId } : {}),
        ...(filters.staffUserId ? { staffUserId: filters.staffUserId } : {}),
        ...(filters.billed !== undefined ? { billed: filters.billed } : {}),
      },
      include: timeEntryInclude,
      orderBy: { entryDate: "desc" },
      take: filters.limit ?? 200,
    })) as unknown as TimeEntryWithContext[];
    return rows.map((r) => this.mapTimeEntry(r));
  }

  async updateTimeEntry(
    barbershopId: string,
    entryId: string,
    data: Partial<{
      description: string | null;
      minutes: number;
      billable: boolean;
      hourlyRate: number | null;
      billed: boolean;
      entryDate: Date;
    }>
  ): Promise<ICaseTimeEntryDTO> {
    const updated = (await prisma.caseTimeEntry.update({
      where: { id: entryId, barbershopId },
      data,
      include: timeEntryInclude,
    })) as unknown as TimeEntryWithContext;
    return this.mapTimeEntry(updated);
  }

  async deleteTimeEntry(barbershopId: string, entryId: string): Promise<void> {
    await prisma.caseTimeEntry.delete({ where: { id: entryId, barbershopId } });
  }

  async summarizeTimeEntries(
    barbershopId: string,
    caseId: string
  ): Promise<ITimeEntrySummaryDTO> {
    const entries = await prisma.caseTimeEntry.findMany({
      where: { barbershopId, caseId },
      select: { minutes: true, billable: true, hourlyRate: true, billed: true },
    });

    let totalMinutes = 0;
    let billableMinutes = 0;
    let billableAmount = 0;
    let unbilledAmount = 0;

    for (const e of entries) {
      totalMinutes += e.minutes;
      if (!e.billable) continue;
      billableMinutes += e.minutes;
      const rate = toNumber(e.hourlyRate) ?? 0;
      const amount = (e.minutes / 60) * rate;
      billableAmount += amount;
      if (!e.billed) unbilledAmount += amount;
    }

    return {
      totalMinutes,
      billableMinutes,
      billableAmount: Math.round(billableAmount * 100) / 100,
      unbilledAmount: Math.round(unbilledAmount * 100) / 100,
      entryCount: entries.length,
    };
  }

  // ─── Honorários de êxito ──────────────────────────────────────────────────

  async createSuccessFee(data: {
    barbershopId: string;
    caseId: string;
    percent: number;
    installments?: number;
    dueDate?: Date | null;
    notes?: string | null;
  }): Promise<ICaseSuccessFeeDTO> {
    const created = (await prisma.caseSuccessFee.create({
      data: {
        barbershopId: data.barbershopId,
        caseId: data.caseId,
        percent: data.percent,
        installments: data.installments ?? 1,
        dueDate: data.dueDate ?? null,
        notes: data.notes ?? null,
      },
      include: successFeeInclude,
    })) as unknown as SuccessFeeWithContext;
    return this.mapSuccessFee(created);
  }

  async listSuccessFees(
    barbershopId: string,
    filters: { caseId?: string; status?: SuccessFeeStatus; limit?: number }
  ): Promise<ICaseSuccessFeeDTO[]> {
    const rows = (await prisma.caseSuccessFee.findMany({
      where: {
        barbershopId,
        ...(filters.caseId ? { caseId: filters.caseId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: successFeeInclude,
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? 100,
    })) as unknown as SuccessFeeWithContext[];
    return rows.map((r) => this.mapSuccessFee(r));
  }

  async findSuccessFee(
    barbershopId: string,
    feeId: string
  ): Promise<ICaseSuccessFeeDTO | null> {
    const found = (await prisma.caseSuccessFee.findFirst({
      where: { id: feeId, barbershopId },
      include: successFeeInclude,
    })) as unknown as SuccessFeeWithContext | null;
    return found ? this.mapSuccessFee(found) : null;
  }

  async updateSuccessFee(
    barbershopId: string,
    feeId: string,
    data: Partial<{
      percent: number;
      baseAmount: number | null;
      amount: number | null;
      installments: number;
      status: SuccessFeeStatus;
      dueDate: Date | null;
      paidAt: Date | null;
      notes: string | null;
    }>
  ): Promise<ICaseSuccessFeeDTO> {
    const updated = (await prisma.caseSuccessFee.update({
      where: { id: feeId, barbershopId },
      data,
      include: successFeeInclude,
    })) as unknown as SuccessFeeWithContext;
    return this.mapSuccessFee(updated);
  }

  async recalculateSuccessFee(
    barbershopId: string,
    feeId: string
  ): Promise<ICaseSuccessFeeDTO | null> {
    const fee = await prisma.caseSuccessFee.findFirst({
      where: { id: feeId, barbershopId },
      select: { id: true, percent: true, case: { select: { awardedAmount: true } } },
    });
    if (!fee) return null;

    const base = toNumber(fee.case.awardedAmount);
    if (base === null) return this.findSuccessFee(barbershopId, feeId);

    const percent = toNumber(fee.percent) ?? 0;
    const amount = Math.round(base * percent * 100) / 10_000;
    return this.updateSuccessFee(barbershopId, feeId, {
      baseAmount: base,
      amount,
    });
  }

  /**
   * Recalcula todos os honorários de êxito de um caso.
   *
   * Chamado quando o valor obtido no caso (`awardedAmount`) muda: o honorário
   * é um valor **derivado** e não pode ficar desatualizado.
   */
  async recalculateSuccessFeesForCase(
    barbershopId: string,
    caseId: string
  ): Promise<void> {
    const fees = await prisma.caseSuccessFee.findMany({
      where: { barbershopId, caseId },
      select: { id: true },
    });
    for (const fee of fees) {
      await this.recalculateSuccessFee(barbershopId, fee.id);
    }
  }

  // ─── Intimações ───────────────────────────────────────────────────────────

  async createIntimation(data: {
    barbershopId: string;
    caseId?: string | null;
    source: IntimationSource;
    receivedAt?: Date;
    subject: string;
    body: string;
    rawPayload?: Prisma.InputJsonValue;
    detectedNumber?: string | null;
    suggestedType?: CaseEventType;
    status?: IntimationStatus;
  }): Promise<ICourtIntimationDTO> {
    const created = (await prisma.courtIntimation.create({
      data: {
        barbershopId: data.barbershopId,
        caseId: data.caseId ?? null,
        source: data.source,
        ...(data.receivedAt ? { receivedAt: data.receivedAt } : {}),
        subject: data.subject,
        body: data.body,
        rawPayload: data.rawPayload ?? undefined,
        detectedNumber: data.detectedNumber ?? null,
        suggestedType: data.suggestedType ?? "INTIMATION",
        status: data.status ?? "NEW",
      },
      include: intimationInclude,
    })) as unknown as IntimationWithContext;
    return this.mapIntimation(created);
  }

  async listIntimations(
    barbershopId: string,
    filters: { status?: IntimationStatus; caseId?: string; limit?: number }
  ): Promise<ICourtIntimationDTO[]> {
    const rows = (await prisma.courtIntimation.findMany({
      where: {
        barbershopId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.caseId ? { caseId: filters.caseId } : {}),
      },
      include: intimationInclude,
      orderBy: { receivedAt: "desc" },
      take: filters.limit ?? 100,
    })) as unknown as IntimationWithContext[];
    return rows.map((r) => this.mapIntimation(r));
  }

  async findIntimation(
    barbershopId: string,
    intimationId: string
  ): Promise<ICourtIntimationDTO | null> {
    const found = (await prisma.courtIntimation.findFirst({
      where: { id: intimationId, barbershopId },
      include: intimationInclude,
    })) as unknown as IntimationWithContext | null;
    return found ? this.mapIntimation(found) : null;
  }

  async updateIntimation(
    barbershopId: string,
    intimationId: string,
    data: Partial<{
      caseId: string | null;
      status: IntimationStatus;
      suggestedType: CaseEventType;
      triagedByUserId: string | null;
      triagedAt: Date | null;
      linkedEventId: string | null;
    }>
  ): Promise<ICourtIntimationDTO> {
    const updated = (await prisma.courtIntimation.update({
      where: { id: intimationId, barbershopId },
      data,
      include: intimationInclude,
    })) as unknown as IntimationWithContext;
    return this.mapIntimation(updated);
  }

  async findCaseByNumber(
    barbershopId: string,
    caseNumber: string
  ): Promise<{ id: string; nickname: string } | null> {
    const found = await prisma.clientCase.findFirst({
      where: { barbershopId, caseNumber },
      select: { id: true, nickname: true },
    });
    return found;
  }

  // ─── NFS-e ────────────────────────────────────────────────────────────────

  async createFeeInvoice(data: {
    barbershopId: string;
    caseId?: string | null;
    clientId?: string | null;
    description: string;
    amount: number;
    issRetained?: boolean;
    taxpayerId?: string | null;
    provider?: FeeInvoiceProvider;
    invoiceNumber?: string | null;
    createdByUserId?: string | null;
  }): Promise<ICaseFeeInvoiceDTO> {
    const created = await prisma.caseFeeInvoice.create({
      data: {
        barbershopId: data.barbershopId,
        caseId: data.caseId ?? null,
        clientId: data.clientId ?? null,
        description: data.description,
        amount: data.amount,
        issRetained: data.issRetained ?? false,
        taxpayerId: data.taxpayerId ?? null,
        provider: data.provider ?? "MANUAL",
        invoiceNumber: data.invoiceNumber ?? null,
        createdByUserId: data.createdByUserId ?? null,
      },
    });
    return this.mapFeeInvoice(created);
  }

  async listFeeInvoices(
    barbershopId: string,
    filters: { caseId?: string; status?: FeeInvoiceStatus; limit?: number }
  ): Promise<ICaseFeeInvoiceDTO[]> {
    const rows = await prisma.caseFeeInvoice.findMany({
      where: {
        barbershopId,
        ...(filters.caseId ? { caseId: filters.caseId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? 100,
    });
    return rows.map((r) => this.mapFeeInvoice(r));
  }

  async findFeeInvoice(
    barbershopId: string,
    invoiceId: string
  ): Promise<ICaseFeeInvoiceDTO | null> {
    const found = await prisma.caseFeeInvoice.findFirst({
      where: { id: invoiceId, barbershopId },
    });
    return found ? this.mapFeeInvoice(found) : null;
  }

  async updateFeeInvoice(
    barbershopId: string,
    invoiceId: string,
    data: Partial<{
      description: string;
      amount: number;
      invoiceNumber: string | null;
      provider: FeeInvoiceProvider;
      status: FeeInvoiceStatus;
      externalId: string | null;
      issuedAt: Date | null;
      xmlUrl: string | null;
      errorMessage: string | null;
      issRetained: boolean;
      taxpayerId: string | null;
    }>
  ): Promise<ICaseFeeInvoiceDTO> {
    const updated = await prisma.caseFeeInvoice.update({
      where: { id: invoiceId, barbershopId },
      data,
    });
    return this.mapFeeInvoice(updated);
  }

  async deleteFeeInvoice(barbershopId: string, invoiceId: string): Promise<void> {
    await prisma.caseFeeInvoice.delete({ where: { id: invoiceId, barbershopId } });
  }

  // ─── Alertas de prazo ─────────────────────────────────────────────────────

  async listDeadlineAlerts(
    barbershopId: string,
    filters: { status?: "PENDING" | "SENT" | "FAILED" | "CANCELED"; limit?: number }
  ): Promise<IDeadlineAlertDTO[]> {
    const rows = (await prisma.deadlineAlert.findMany({
      where: {
        barbershopId,
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: deadlineAlertInclude,
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? 100,
    })) as unknown as DeadlineAlertWithContext[];
    return rows.map((r) => this.mapDeadlineAlert(r));
  }

  async createDeadlineAlert(data: {
    barbershopId: string;
    deadlineId: string;
    userId: string;
    channel?: "WHATSAPP" | "EMAIL";
    kind?: "UPCOMING" | "OVERDUE";
    daysRemaining?: number | null;
    sentOn?: Date;
  }): Promise<IDeadlineAlertDTO> {
    const created = (await prisma.deadlineAlert.create({
      data: {
        barbershopId: data.barbershopId,
        deadlineId: data.deadlineId,
        userId: data.userId,
        channel: data.channel ?? "WHATSAPP",
        kind: data.kind ?? "UPCOMING",
        daysRemaining: data.daysRemaining ?? null,
        sentOn: data.sentOn ?? new Date(),
      },
      include: deadlineAlertInclude,
    })) as unknown as DeadlineAlertWithContext;
    return this.mapDeadlineAlert(created);
  }

  async findDeadlineAlert(
    deadlineId: string,
    userId: string,
    kind: "UPCOMING" | "OVERDUE",
    channel: "WHATSAPP" | "EMAIL",
    sentOn: Date
  ): Promise<IDeadlineAlertDTO | null> {
    const found = (await prisma.deadlineAlert.findFirst({
      where: { deadlineId, userId, kind, channel, sentOn },
      include: deadlineAlertInclude,
    })) as unknown as DeadlineAlertWithContext | null;
    return found ? this.mapDeadlineAlert(found) : null;
  }

  async updateDeadlineAlert(
    alertId: string,
    data: Partial<{
      status: "PENDING" | "SENT" | "FAILED" | "CANCELED";
      sentAt: Date | null;
      errorMessage: string | null;
      daysRemaining: number | null;
    }>
  ): Promise<void> {
    await prisma.deadlineAlert.update({ where: { id: alertId }, data });
  }

  /**
   * Prazos pendentes que vencem dentro de `withinDays` dias corridos (ou já
   * venceu, quando `includeOverdue`). Usado pelo cron de alertas.
   */
  async findDeadlinesNeedingAlert(
    withinDays: number,
    includeOverdue: boolean
  ): Promise<
    Array<{
      id: string;
      barbershopId: string;
      title: string;
      dueDate: Date;
      caseId: string | null;
      caseName: string | null;
      barbershopName: string;
      barbershopWhatsapp: string;
      ownerUserIds: string[];
    }>
  > {
    const now = new Date();
    const until = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

    const deadlines = await prisma.caseDeadline.findMany({
      where: {
        status: "PENDING",
        dueDate: {
          lte: until,
          ...(includeOverdue ? {} : { gte: new Date(now.toISOString().slice(0, 10)) }),
        },
      },
      select: {
        id: true,
        barbershopId: true,
        title: true,
        dueDate: true,
        caseId: true,
        case: { select: { nickname: true } },
        barbershop: {
          select: {
            id: true,
            name: true,
            whatsapp: true,
            users: {
              where: { role: { in: ["OWNER", "MASTER_ADMIN"] }, active: true },
              select: { id: true },
            },
          },
        },
      },
      take: 500,
    });

    return deadlines.map((d) => ({
      id: d.id,
      barbershopId: d.barbershopId,
      title: d.title,
      dueDate: d.dueDate,
      caseId: d.caseId,
      caseName: d.case?.nickname ?? null,
      barbershopName: d.barbershop.name,
      barbershopWhatsapp: d.barbershop.whatsapp,
      ownerUserIds: d.barbershop.users.map((u) => u.id),
    }));
  }

  // ─── Transferências ───────────────────────────────────────────────────────

  async createTransfer(data: {
    barbershopId: string;
    caseId: string;
    targetBarbershopId: string;
    reason?: string | null;
    requestedByUserId: string;
  }): Promise<ICaseTransferDTO> {
    const created = (await prisma.caseTransfer.create({
      data: {
        barbershopId: data.barbershopId,
        caseId: data.caseId,
        targetBarbershopId: data.targetBarbershopId,
        reason: data.reason ?? null,
        requestedByUserId: data.requestedByUserId,
      },
      include: transferInclude,
    })) as unknown as TransferWithContext;
    return this.mapTransfer(created);
  }

  async listTransfers(
    barbershopId: string,
    filters: { status?: CaseTransferStatus; role?: "origin" | "target"; limit?: number }
  ): Promise<ICaseTransferDTO[]> {
    const rows = (await prisma.caseTransfer.findMany({
      where: {
        ...(filters.role === "target"
          ? { targetBarbershopId: barbershopId }
          : filters.role === "origin"
            ? { barbershopId }
            : { OR: [{ barbershopId }, { targetBarbershopId: barbershopId }] }),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: transferInclude,
      orderBy: { updatedAt: "desc" },
      take: filters.limit ?? 100,
    })) as unknown as TransferWithContext[];
    return rows.map((r) => this.mapTransfer(r));
  }

  async findTransfer(
    barbershopId: string,
    transferId: string
  ): Promise<ICaseTransferDTO | null> {
    const found = (await prisma.caseTransfer.findFirst({
      where: {
        id: transferId,
        OR: [{ barbershopId }, { targetBarbershopId: barbershopId }],
      },
      include: transferInclude,
    })) as unknown as TransferWithContext | null;
    return found ? this.mapTransfer(found) : null;
  }

  async updateTransfer(
    barbershopId: string,
    transferId: string,
    data: Partial<{
      status: CaseTransferStatus;
      acceptedByUserId: string | null;
      acceptedAt: Date | null;
      reason: string | null;
    }>
  ): Promise<ICaseTransferDTO> {
    // A transferência é respondida pela **unidade de destino**, mas o registro
    // guarda `barbershopId` = origem (trilha de auditoria). Por isso a busca
    // considera os dois lados.
    const updated = (await prisma.caseTransfer.update({
      where: {
        id: transferId,
        OR: [{ barbershopId }, { targetBarbershopId: barbershopId }],
      },
      data,
      include: transferInclude,
    })) as unknown as TransferWithContext;
    return this.mapTransfer(updated);
  }

  /**
   * Move o caso e tudo que é vinculado (tarefas, prazos, andamentos,
   * documentos, contratos, timesheet, honorários, intimações, NFS-e) para a
   * unidade de destino, em uma única transação.
   */
  async moveCaseToShop(
    caseId: string,
    originBarbershopId: string,
    targetBarbershopId: string
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const theCase = await tx.clientCase.findFirst({
        where: { id: caseId, barbershopId: originBarbershopId },
        select: { id: true },
      });
      if (!theCase) {
        throw new Error("Caso não encontrado na origem");
      }

      await tx.clientCase.update({
        where: { id: caseId },
        data: { barbershopId: targetBarbershopId },
      });
      await tx.caseTask.updateMany({
        where: { caseId },
        data: { barbershopId: targetBarbershopId },
      });
      await tx.caseDeadline.updateMany({
        where: { caseId },
        data: { barbershopId: targetBarbershopId },
      });
      await tx.caseEvent.updateMany({
        where: { caseId },
        data: { barbershopId: targetBarbershopId },
      });
      await tx.caseDocument.updateMany({
        where: { caseId },
        data: { barbershopId: targetBarbershopId },
      });
      await tx.caseContract.updateMany({
        where: { caseId },
        data: { barbershopId: targetBarbershopId },
      });
      const contractIds = await tx.caseContract.findMany({
        where: { caseId },
        select: { id: true },
      });
      if (contractIds.length > 0) {
        await tx.contractSignature.updateMany({
          where: { contractId: { in: contractIds.map((c) => c.id) } },
          data: { barbershopId: targetBarbershopId },
        });
      }
      await tx.caseTimeEntry.updateMany({
        where: { caseId },
        data: { barbershopId: targetBarbershopId },
      });
      await tx.caseSuccessFee.updateMany({
        where: { caseId },
        data: { barbershopId: targetBarbershopId },
      });
      await tx.courtIntimation.updateMany({
        where: { caseId },
        data: { barbershopId: targetBarbershopId },
      });
      await tx.caseFeeInvoice.updateMany({
        where: { caseId },
        data: { barbershopId: targetBarbershopId },
      });
    });
  }

  /** Unidades irmãs (mesma organização) disponíveis para transferência. */
  async listSiblingShops(
    barbershopId: string
  ): Promise<Array<{ id: string; name: string }>> {
    const shop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { organizationId: true },
    });
    if (!shop?.organizationId) return [];

    const siblings = await prisma.barbershop.findMany({
      where: {
        organizationId: shop.organizationId,
        id: { not: barbershopId },
        active: true,
        approvalStatus: "APPROVED",
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return siblings;
  }

  // ─── Portal do cliente ────────────────────────────────────────────────────

  /**
   * Casos visíveis no portal do cliente a partir da **identidade** (login do
   * portal), percorrendo todos os vínculos confirmados da identidade.
   *
   * Só entram os casos com `shareWithClient` ligado. Nunca expõe número do
   * processo, apelido interno, parte adversária, tribunal ou observações.
   */
  async listClientPortalCasesByIdentity(
    identityId: string,
    limit: number
  ): Promise<
    Array<{
      id: string;
      barbershopId: string;
      barbershopName: string;
      label: string;
      status: string;
      practiceArea: string | null;
      nextAppointment: { id: string; scheduledAt: Date; time: string | null; serviceName: string | null } | null;
      sharedEvents: Array<{
        id: string;
        type: CaseEventType;
        title: string;
        description: string | null;
        occurredAt: Date;
      }>;
      pendingSignatures: Array<{ id: string; contractTitle: string; token: string }>;
    }>
  > {
    // `Appointment.date` é uma coluna `@db.Date`: o filtro precisa de um
    // DateTime completo (meia-noite UTC), não de "YYYY-MM-DD".
    const todayStart = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

    const links = await prisma.clientSalonLink.findMany({
      where: { identityId, status: "CONFIRMED", salonClientId: { not: null } },
      select: { barbershopId: true, salonClientId: true },
    });

    if (links.length === 0) return [];

    const cases = await prisma.clientCase.findMany({
      where: {
        shareWithClient: true,
        OR: links.map((l) => ({
          barbershopId: l.barbershopId,
          clientId: l.salonClientId as string,
        })),
      },
      select: {
        id: true,
        barbershopId: true,
        clientId: true,
        practiceArea: true,
        status: true,
        barbershop: { select: { name: true } },
        events: {
          where: { visibleToClient: true },
          orderBy: { occurredAt: "desc" },
          take: 20,
          select: {
            id: true,
            type: true,
            title: true,
            description: true,
            occurredAt: true,
          },
        },
        contracts: {
          where: { status: { in: ["SENT", "PARTIALLY_SIGNED"] } },
          select: {
            id: true,
            title: true,
            signatures: {
              where: { status: "PENDING", role: "CLIENT" },
              select: { id: true, token: true },
            },
          },
        },
        appointments: {
          where: {
            date: { gte: todayStart },
            status: { in: ["CONFIRMED"] },
          },
          orderBy: [{ date: "asc" }, { time: "asc" }],
          take: 1,
          select: {
            id: true,
            date: true,
            time: true,
            service: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return cases.map((c) => ({
      id: c.id,
      barbershopId: c.barbershopId,
      barbershopName: c.barbershop.name,
      label: c.practiceArea?.trim() || "Processo",
      status: c.status,
      practiceArea: c.practiceArea,
      nextAppointment: c.appointments[0]
        ? {
            id: c.appointments[0].id,
            scheduledAt: c.appointments[0].date,
            time: c.appointments[0].time,
            serviceName: c.appointments[0].service?.name ?? null,
          }
        : null,
      sharedEvents: c.events.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        description: e.description,
        occurredAt: e.occurredAt,
      })),
      pendingSignatures: c.contracts
        .flatMap((contract) =>
          contract.signatures.map((s) => ({
            id: s.id,
            contractTitle: contract.title,
            token: s.token,
          }))
        )
        .slice(0, 10),
    }));
  }

  // ─── Mappers ──────────────────────────────────────────────────────────────

  private mapContract(row: ContractWithContext): ICaseContractDTO {
    const pending =
      row.signatures?.filter((s) => s.status === "PENDING").length ?? 0;
    return {
      id: row.id,
      barbershopId: row.barbershopId,
      caseId: row.caseId,
      clientId: row.clientId,
      clientName: row.client?.name ?? null,
      title: row.title,
      type: row.type,
      status: row.status,
      content: row.content,
      fileUrl: row.fileUrl,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      version: row.version,
      value: toNumber(row.value),
      feePercent: toNumber(row.feePercent),
      notes: row.notes,
      signedAt: row.signedAt,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      signatures: (row.signatures ?? []).map((s) => this.mapSignature(s)),
      pendingSignatures: pending,
    };
  }

  private mapSignature(row: SignatureWithContext): IContractSignatureDTO {
    return {
      id: row.id,
      barbershopId: row.barbershopId,
      contractId: row.contractId,
      signerName: row.signerName,
      signerEmail: row.signerEmail,
      signerWhatsapp: row.signerWhatsapp,
      role: row.role,
      status: row.status,
      signatureUrl: row.signatureUrl,
      signatureType: row.signatureType,
      signedAt: row.signedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapTimeEntry(row: TimeEntryWithContext): ICaseTimeEntryDTO {
    const rate = toNumber(row.hourlyRate);
    return {
      id: row.id,
      barbershopId: row.barbershopId,
      caseId: row.caseId,
      clientId: row.clientId,
      staffUserId: row.staffUserId,
      staffName: row.staffUser?.name ?? null,
      description: row.description,
      minutes: row.minutes,
      billable: row.billable,
      hourlyRate: rate,
      billed: row.billed,
      entryDate: row.entryDate,
      amount:
        rate !== null ? Math.round(((row.minutes / 60) * rate) * 100) / 100 : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapSuccessFee(row: SuccessFeeWithContext): ICaseSuccessFeeDTO {
    return {
      id: row.id,
      barbershopId: row.barbershopId,
      caseId: row.caseId,
      caseName: row.case?.nickname ?? null,
      percent: toNumber(row.percent) ?? 0,
      baseAmount: toNumber(row.baseAmount),
      amount: toNumber(row.amount),
      installments: row.installments,
      status: row.status,
      dueDate: row.dueDate,
      paidAt: row.paidAt,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapIntimation(row: IntimationWithContext): ICourtIntimationDTO {
    return {
      id: row.id,
      barbershopId: row.barbershopId,
      caseId: row.caseId,
      caseName: row.case?.nickname ?? null,
      source: row.source,
      receivedAt: row.receivedAt,
      subject: row.subject,
      body: row.body,
      detectedNumber: row.detectedNumber,
      suggestedType: row.suggestedType,
      status: row.status,
      triagedAt: row.triagedAt,
      linkedEventId: row.linkedEventId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapFeeInvoice(row: {
    id: string;
    barbershopId: string;
    caseId: string | null;
    clientId: string | null;
    invoiceNumber: string | null;
    externalId: string | null;
    provider: FeeInvoiceProvider;
    status: FeeInvoiceStatus;
    description: string;
    amount: { toString(): string } | number;
    issRetained: boolean;
    taxpayerId: string | null;
    issuedAt: Date | null;
    xmlUrl: string | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ICaseFeeInvoiceDTO {
    return {
      id: row.id,
      barbershopId: row.barbershopId,
      caseId: row.caseId,
      clientId: row.clientId,
      invoiceNumber: row.invoiceNumber,
      externalId: row.externalId,
      provider: row.provider,
      status: row.status,
      description: row.description,
      amount: toNumber(row.amount) ?? 0,
      issRetained: row.issRetained,
      taxpayerId: row.taxpayerId,
      issuedAt: row.issuedAt,
      xmlUrl: row.xmlUrl,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapDeadlineAlert(row: DeadlineAlertWithContext): IDeadlineAlertDTO {
    return {
      id: row.id,
      barbershopId: row.barbershopId,
      deadlineId: row.deadlineId,
      deadlineTitle: row.deadline?.title ?? null,
      userId: row.userId,
      channel: row.channel,
      kind: row.kind,
      daysRemaining: row.daysRemaining,
      sentOn: row.sentOn,
      status: row.status,
      sentAt: row.sentAt,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
    };
  }

  private mapTransfer(row: TransferWithContext): ICaseTransferDTO {
    return {
      id: row.id,
      barbershopId: row.barbershopId,
      originName: row.barbershop?.name ?? null,
      caseId: row.caseId,
      caseName: row.case?.nickname ?? null,
      targetBarbershopId: row.targetBarbershopId,
      targetName: row.targetBarbershop?.name ?? null,
      reason: row.reason,
      status: row.status,
      requestedByUserId: row.requestedByUserId,
      acceptedByUserId: row.acceptedByUserId,
      acceptedAt: row.acceptedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Expõe o token interno do mapper de assinatura (uso interno do módulo). */
  signatureTokenOf(signatureId: string): Promise<string | null> {
    return prisma.contractSignature
      .findUnique({ where: { id: signatureId }, select: { token: true } })
      .then((r) => r?.token ?? null);
  }
}
