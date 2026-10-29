import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  AddContractSignerUseCase,
  CreateCaseContractUseCase,
  DeclineContractUseCase,
  GetPublicContractUseCase,
  ListCaseContractsUseCase,
  SendContractForSignatureUseCase,
  SignContractUseCase,
  UpdateCaseContractUseCase,
} from "../useCases/caseContractUseCases";
import {
  CreateCaseTransferUseCase,
  CreateFeeInvoiceUseCase,
  CreateIntimationUseCase,
  CreateSuccessFeeUseCase,
  CreateTimeEntryUseCase,
  DeleteTimeEntryUseCase,
  ImportIntimationsUseCase,
  IssueFeeInvoiceUseCase,
  ListCaseTransfersUseCase,
  ListFeeInvoicesUseCase,
  ListIntimationsUseCase,
  ListSiblingShopsUseCase,
  ListSuccessFeesUseCase,
  ListTimeEntriesUseCase,
  RespondCaseTransferUseCase,
  SummarizeTimeEntriesUseCase,
  TriageIntimationUseCase,
  UpdateFeeInvoiceUseCase,
  UpdateSuccessFeeUseCase,
  UpdateTimeEntryUseCase,
} from "../useCases/caseBacklogUseCases";
import {
  ListDeadlineAlertsUseCase,
  ListClientPortalCasesUseCase,
} from "../useCases/deadlineAlertUseCases";
import {
  addContractSignerSchema,
  createCaseContractSchema,
  createDeadlineAlertSchema,
  createFeeInvoiceSchema,
  createIntimationSchema,
  createSuccessFeeSchema,
  createTimeEntrySchema,
  createTransferSchema,
  declineContractSchema,
  importIntimationsSchema,
  issueFeeInvoiceSchema,
  listDeadlineAlertsQuerySchema,
  portalCasesQuerySchema,
  respondTransferSchema,
  signContractSchema,
  triageIntimationSchema,
  updateCaseContractSchema,
  updateFeeInvoiceSchema,
  updateSuccessFeeSchema,
  updateTimeEntrySchema,
} from "../schemas/caseBacklogSchemas";
import {
  CreateCaseEventUseCase,
  type RequestingUser,
} from "../useCases/caseManagementUseCases";

/**
 * Controller do backlog de gestão de processos.
 *
 * Rotas do painel do escritório exigem usuário autenticado do tenant. As
 * únicas rotas públicas são as de assinatura (`/contracts/sign/:token`), que
 * usam o token do signatário como credencial.
 */
export class CaseBacklogController {
  private user(req: FastifyRequest): RequestingUser {
    return req.user as RequestingUser;
  }

  private barbershopId(req: FastifyRequest): string {
    const barbershopId = (req.user as { barbershopId?: string })?.barbershopId;
    if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);
    return barbershopId;
  }

  private params(req: FastifyRequest, key: string): string {
    const value = (req.params as Record<string, string>)?.[key];
    if (!value) throw new AppError(`${key} é obrigatório`, 400);
    return value;
  }

  // ─── Contratos ────────────────────────────────────────────────────────────

  async createContract(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateCaseContractUseCase);
    const body = createCaseContractSchema.parse(req.body);
    const contract = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "caseId"),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: contract });
  }

  async listContracts(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListCaseContractsUseCase);
    const query = (req.query ?? {}) as {
      caseId?: string;
      status?: "DRAFT" | "SENT" | "PARTIALLY_SIGNED" | "SIGNED" | "VOID";
      limit?: number;
    };
    const contracts = await useCase.execute(
      this.barbershopId(req),
      query,
      this.user(req)
    );
    return reply.send({ success: true, data: contracts });
  }

  async updateContract(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(UpdateCaseContractUseCase);
    const body = updateCaseContractSchema.parse(req.body);
    const contract = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "contractId"),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: contract });
  }

  async addSigner(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(AddContractSignerUseCase);
    const body = addContractSignerSchema.parse(req.body);
    const signature = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "contractId"),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: signature });
  }

  async sendForSignature(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(SendContractForSignatureUseCase);
    const body = (req.body ?? {}) as { message?: string | null };
    const result = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "contractId"),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: result });
  }

  // ─── Assinatura (público) ─────────────────────────────────────────────────

  async getPublicContract(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(GetPublicContractUseCase);
    const contract = await useCase.execute(this.params(req, "token"));
    return reply.send({ success: true, data: contract });
  }

  async signContract(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(SignContractUseCase);
    const body = signContractSchema.parse(req.body);
    const result = await useCase.execute(this.params(req, "token"), body);
    return reply.send({ success: true, data: result });
  }

  async declineContract(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(DeclineContractUseCase);
    const body = declineContractSchema.parse(req.body ?? {});
    await useCase.execute(this.params(req, "token"), body);
    return reply.send({ success: true, data: { declined: true } });
  }

  // ─── Timesheet ────────────────────────────────────────────────────────────

  async createTimeEntry(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateTimeEntryUseCase);
    const body = createTimeEntrySchema.parse(req.body);
    const entry = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "caseId"),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: entry });
  }

  async listTimeEntries(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListTimeEntriesUseCase);
    const query = (req.query ?? {}) as {
      caseId?: string;
      staffUserId?: string;
      billed?: boolean;
      limit?: number;
    };
    const entries = await useCase.execute(
      this.barbershopId(req),
      query,
      this.user(req)
    );
    return reply.send({ success: true, data: entries });
  }

  async updateTimeEntry(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(UpdateTimeEntryUseCase);
    const body = updateTimeEntrySchema.parse(req.body);
    const entry = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "entryId"),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: entry });
  }

  async deleteTimeEntry(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(DeleteTimeEntryUseCase);
    await useCase.execute(
      this.barbershopId(req),
      this.params(req, "entryId"),
      this.user(req)
    );
    return reply.send({ success: true, data: { deleted: true } });
  }

  async summarizeTimeEntries(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(SummarizeTimeEntriesUseCase);
    const summary = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "caseId"),
      this.user(req)
    );
    return reply.send({ success: true, data: summary });
  }

  // ─── Honorários de êxito ──────────────────────────────────────────────────

  async createSuccessFee(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateSuccessFeeUseCase);
    const body = createSuccessFeeSchema.parse(req.body);
    const fee = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "caseId"),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: fee });
  }

  async listSuccessFees(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListSuccessFeesUseCase);
    const query = (req.query ?? {}) as {
      caseId?: string;
      status?: "PENDING" | "INVOICED" | "PAID" | "CANCELED";
      limit?: number;
    };
    const fees = await useCase.execute(
      this.barbershopId(req),
      query,
      this.user(req)
    );
    return reply.send({ success: true, data: fees });
  }

  async updateSuccessFee(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(UpdateSuccessFeeUseCase);
    const body = updateSuccessFeeSchema.parse(req.body);
    const fee = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "feeId"),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: fee });
  }

  // ─── Intimações ───────────────────────────────────────────────────────────

  async createIntimation(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateIntimationUseCase);
    const body = createIntimationSchema.parse(req.body);
    const intimation = await useCase.execute(
      this.barbershopId(req),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: intimation });
  }

  async importIntimations(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ImportIntimationsUseCase);
    const body = importIntimationsSchema.parse(req.body);
    const result = await useCase.execute(
      this.barbershopId(req),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: result });
  }

  async listIntimations(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListIntimationsUseCase);
    const query = (req.query ?? {}) as {
      status?: "NEW" | "TRIAGED" | "LINKED" | "IGNORED";
      caseId?: string;
      limit?: number;
    };
    const intimations = await useCase.execute(
      this.barbershopId(req),
      query,
      this.user(req)
    );
    return reply.send({ success: true, data: intimations });
  }

  async triageIntimation(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(TriageIntimationUseCase);
    const body = triageIntimationSchema.parse(req.body ?? {});

    // Geração de andamento: usa o caso de gestão de processos (mesmo módulo).
    const createEvent = async (args: {
      caseId: string;
      title: string;
      description?: string | null;
      type:
        | "NOTE"
        | "MEETING"
        | "FILING"
        | "COURT_MOTION"
        | "DEADLINE"
        | "INTIMATION"
        | "PAYMENT"
        | "CLIENT_CONTACT";
      occurredAt: Date;
      visibleToClient: boolean;
    }): Promise<string> => {
      const eventUseCase = container.resolve(CreateCaseEventUseCase);
      const event = await eventUseCase.execute(
        this.barbershopId(req),
        args.caseId,
        {
          title: args.title,
          description: args.description ?? null,
          type: args.type,
          occurredAt: args.occurredAt,
          visibleToClient: args.visibleToClient,
        },
        this.user(req)
      );
      return event.id;
    };

    const intimation = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "intimationId"),
      body,
      createEvent,
      this.user(req)
    );
    return reply.send({ success: true, data: intimation });
  }

  // ─── NFS-e ────────────────────────────────────────────────────────────────

  async createFeeInvoice(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateFeeInvoiceUseCase);
    const body = createFeeInvoiceSchema.parse(req.body);
    const invoice = await useCase.execute(
      this.barbershopId(req),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: invoice });
  }

  async listFeeInvoices(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListFeeInvoicesUseCase);
    const query = (req.query ?? {}) as {
      caseId?: string;
      status?: "DRAFT" | "ISSUED" | "CANCELED" | "FAILED";
      limit?: number;
    };
    const invoices = await useCase.execute(
      this.barbershopId(req),
      query,
      this.user(req)
    );
    return reply.send({ success: true, data: invoices });
  }

  async updateFeeInvoice(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(UpdateFeeInvoiceUseCase);
    const body = updateFeeInvoiceSchema.parse(req.body);
    const invoice = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "invoiceId"),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: invoice });
  }

  async issueFeeInvoice(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(IssueFeeInvoiceUseCase);
    const body = issueFeeInvoiceSchema.parse(req.body ?? {});
    const invoice = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "invoiceId"),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: invoice });
  }

  // ─── Alertas de prazo ─────────────────────────────────────────────────────

  async listDeadlineAlerts(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListDeadlineAlertsUseCase);
    const query = listDeadlineAlertsQuerySchema.parse(req.query ?? {});
    const alerts = await useCase.execute(
      this.barbershopId(req),
      this.user(req),
      query
    );
    return reply.send({ success: true, data: alerts });
  }

  // ─── Transferências ───────────────────────────────────────────────────────

  async createTransfer(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(CreateCaseTransferUseCase);
    const body = createTransferSchema.parse(req.body);
    const transfer = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "caseId"),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: transfer });
  }

  async listSiblingShops(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListSiblingShopsUseCase);
    const shops = await useCase.execute(this.barbershopId(req), this.user(req));
    return reply.send({ success: true, data: shops });
  }

  async listTransfers(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListCaseTransfersUseCase);
    const query = (req.query ?? {}) as {
      status?: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELED";
      role?: "origin" | "target";
      limit?: number;
    };
    const transfers = await useCase.execute(
      this.barbershopId(req),
      query,
      this.user(req)
    );
    return reply.send({ success: true, data: transfers });
  }

  async respondTransfer(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(RespondCaseTransferUseCase);
    const body = respondTransferSchema.parse(req.body);
    const transfer = await useCase.execute(
      this.barbershopId(req),
      this.params(req, "transferId"),
      body,
      this.user(req)
    );
    return reply.send({ success: true, data: transfer });
  }

  // ─── Portal do cliente ────────────────────────────────────────────────────

  async listPortalCases(req: FastifyRequest, reply: FastifyReply) {
    const useCase = container.resolve(ListClientPortalCasesUseCase);
    const query = portalCasesQuerySchema.parse(req.query ?? {});
    const identityId = (req.user as { identityId?: string })?.identityId;
    if (!identityId) throw new AppError("Cliente não identificado", 401);
    const cases = await useCase.execute(identityId, query.limit);
    return reply.send({ success: true, data: cases });
  }
}
