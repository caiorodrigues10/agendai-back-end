import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import { IServiceRepository } from "@/modules/services/repositories/IServiceRepository";
import { IUserRepository } from "@/modules/users/repositories/IUserRepository";
import { ICommissionRepository } from "@/modules/commissions/repositories/ICommissionRepository";
import { ISalonClientRepository } from "@/modules/clients/repositories/ISalonClientRepository";
import { IFiadoRepository } from "@/modules/fiado/repositories/IFiadoRepository";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { recordFiadoCreated, recordQueueCompletion } from "@/modules/crm/services/crmLedger";

type CommissionSplit = { professionalId: string; percentage: number };

export interface CompleteServiceInput {
  barbershopId: string;
  serviceName?: string | null;
  serviceId?: string;
  staffUserId: string;
  finalPrice?: number;
  paymentMethod?: string;
  commissionSplits?: CommissionSplit[];
  customerName?: string;
  whatsapp?: string;
  clientId?: string | null;
  sourceType: "QUEUE_ITEM" | "APPOINTMENT";
  sourceId: string;
  skipRecordCompletion?: boolean;
}

@injectable()
export class CompleteServiceUseCase {
  constructor(
    @inject("BarbershopRepository") private barbershopRepository: IBarbershopRepository,
    @inject("ServiceRepository") private serviceRepository: IServiceRepository,
    @inject("UserRepository") private userRepository: IUserRepository,
    @inject("CommissionRepository") private commissionRepository: ICommissionRepository,
    @inject("SalonClientRepository") private salonClients: ISalonClientRepository,
    @inject("FiadoRepository") private fiadoRepository: IFiadoRepository,
  ) {}

  async execute(input: CompleteServiceInput): Promise<{
    completionPrice: number;
    resolvedSplits?: CommissionSplit[];
    clientId?: string | null;
  }> {
    const service = input.serviceId
      ? await this.serviceRepository.findById(input.serviceId, input.barbershopId)
      : null;

    const completionPrice = input.finalPrice ?? service?.price ?? 0;

    const isFiado = input.paymentMethod === "fiado";
    if (isFiado && completionPrice <= 0) {
      throw new AppError("Informe um valor maior que zero para registrar o fiado", 400);
    }

    let resolvedSplits = input.commissionSplits;
    if (resolvedSplits === undefined) {
      const expected = service?.commissionPercent ?? 0;
      if (expected > 0) resolvedSplits = [{ professionalId: input.staffUserId, percentage: expected }];
    }

    if (resolvedSplits) {
      const expected = service?.commissionPercent ?? 0;
      const total = resolvedSplits.reduce((sum, split) => sum + split.percentage, 0);
      if (Math.abs(total - expected) > 0.01) throw new AppError(`A divisao deve totalizar ${expected}% de comissao`, 400);
      const ids = resolvedSplits.map((split) => split.professionalId);
      if (new Set(ids).size !== ids.length) throw new AppError("Cada profissional so pode aparecer uma vez na divisao", 400);
      const professionals = await this.userRepository.listActiveByBarbershop(input.barbershopId, ids);
      if (professionals.length !== ids.length) throw new AppError("Um dos profissionais nao pertence a este salao", 400);
      if (completionPrice < 0) throw new AppError("Informe o valor final recebido para calcular a comissao", 400);
    }

    let clientId = input.clientId ?? null;
    if (input.customerName && input.whatsapp) {
      try {
        const client = await this.salonClients.upsertFromVisit(input.barbershopId, input.customerName, input.whatsapp);
        clientId = client?.id ?? clientId;
      } catch { /* CRM nao bloqueia */ }
    }

    if (isFiado && input.customerName && input.whatsapp) {
      const fiado = await this.fiadoRepository.create({
        barbershopId: input.barbershopId,
        customerName: input.customerName,
        whatsapp: input.whatsapp,
        clientId,
        description: input.serviceName || "Atendimento",
        amount: completionPrice,
        notes: `Gerado automaticamente ao finalizar ${input.sourceType === "QUEUE_ITEM" ? "o atendimento da fila" : "o agendamento"} (${input.sourceId}).`,
        createdById: input.staffUserId,
      });
      if (fiado) await recordFiadoCreated(fiado.id);
    }

    if (!input.skipRecordCompletion) {
      try { await recordQueueCompletion(input.sourceId); } catch { /* ledger nao bloqueia */ }
    }

    return { completionPrice, resolvedSplits, clientId };
  }

  async notifyWhatsApp(barbershopId: string, phone: string, message: string, opts: {
    deduplicationKey: string;
    notificationType: string;
    clientId?: string | null;
    sourceType: string;
    sourceId: string;
  }) {
    try {
      const shop = await this.barbershopRepository.findById(barbershopId);
      const instanceName = shop?.evolutionInstanceName?.trim();
      if (instanceName) {
        await enqueueWhatsApp({
          phone,
          message,
          instanceName,
          deduplicationKey: opts.deduplicationKey,
          notificationType: opts.notificationType as any,
          barbershopId,
          clientId: opts.clientId ?? undefined,
          sourceType: opts.sourceType as any,
          sourceId: opts.sourceId,
        });
      }
    } catch { /* notificacao nao bloqueia */ }
  }
}
