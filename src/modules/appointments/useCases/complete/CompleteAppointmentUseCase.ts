import { inject, injectable } from "tsyringe";
import type { AppTx } from "@/libs/prismaClient";
import { rlsTransaction } from "@/libs/prismaExtensions";
import { AppError } from "@/shared/errors/AppError";
import { IAppointmentRepository } from "../../repositories/IAppointmentRepository";
import { CompleteServiceUseCase } from "@/modules/shared/useCases/CompleteServiceUseCase";
import { ProductCatalogUseCase } from "@/modules/products/useCases/productUseCases";
import { IProcedureRecordRepository } from "@/modules/clients/repositories/ProcedureRecordRepository";
import { isPlaceholderWhatsApp } from "@/modules/queue/utils/queueDuplicate";
import { publishRealtime } from "@/shared/services/realtimeService";
import { ReviewInvitationService } from "@/modules/reputation/reviewInvitationService";
import { commissionAmount } from "@/modules/financial/ledger/commissionMath";
import { recordLedgerEntry } from "@/modules/financial/ledger/financialLedger";
import { recordAppointmentCompletion, recordFiadoCreated } from "@/modules/crm/services/crmLedger";
import {
  appointmentTotal,
  commissionBase,
  toCents,
  toReais,
  type AddonSnapshot,
} from "@/modules/addons";
import { addonRowToSnapshot } from "../../utils/appointmentAddons";

interface ProcedureInput {
  title: string;
  formula?: string;
  details?: string;
  serviceName?: string;
  professionalName?: string;
}

interface CompleteAppointmentRequest {
  appointmentId: string;
  userId: string;
  userRole: string;
  barbershopId: string;
  finalPrice?: number;
  paymentMethod?: string;
  commissionSplits?: { professionalId: string; percentage: number }[];
  retailSale?: {
    paymentMethod: "cash" | "pix" | "credit_card" | "debit_card" | "fiado";
    items: Array<{ productId: string; quantity: number; unitPrice?: number }>;
    discount?: number;
    clientId?: string;
    idempotencyKey?: string;
  };
  procedure?: ProcedureInput;
}

@injectable()
export class CompleteAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository") private appointmentRepository: IAppointmentRepository,
    @inject(CompleteServiceUseCase) private completeService: CompleteServiceUseCase,
    @inject(ProductCatalogUseCase) private productCatalog: ProductCatalogUseCase,
    @inject("ProcedureRecordRepository") private procedureRepository?: IProcedureRecordRepository,
  ) {}

  async execute(request: CompleteAppointmentRequest) {
    if (request.userRole !== "MASTER_ADMIN" && request.userRole !== "OWNER" && request.userRole !== "EMPLOYEE") {
      throw new AppError("Você não possui permissão para finalizar atendimentos", 403);
    }
    const appointment = await this.appointmentRepository.findById(request.appointmentId);
    if (!appointment) throw new AppError("Agendamento não encontrado", 404);
    if (appointment.barbershopId !== request.barbershopId) throw new AppError("Agendamento não pertence a este salão", 403);
    if (appointment.status === "COMPLETED") throw new AppError("Este agendamento já foi finalizado", 409);
    if (appointment.status === "CANCELLED") throw new AppError("Não é possível finalizar um agendamento cancelado", 400);

    // FASE 3: snapshots gravados no agendamento (imutáveis) determinam o
    // preço/comissão — o catálogo atual é irrelevante aqui.
    const addonSnapshots: AddonSnapshot[] = (appointment.addons ?? []).map(
      addonRowToSnapshot
    );
    const baseReais = appointment.servicePrice ?? 0;
    const baseCents = toCents(baseReais);
    // finalPrice padrão = base + Σ adicionais; sem adicional = base (idêntico
    // ao de hoje — `servicePrice`).
    const defaultFinalPrice = toReais(appointmentTotal(baseCents, addonSnapshots));
    const finalPriceInput = request.finalPrice ?? defaultFinalPrice;

    // Valida preço/divisão de comissão e resolve o cliente ANTES de gravar qualquer coisa.
    const resolved = await this.completeService.execute({
      barbershopId: request.barbershopId,
      serviceName: appointment.serviceName,
      serviceId: appointment.serviceId,
      staffUserId: request.userId,
      finalPrice: finalPriceInput,
      paymentMethod: request.paymentMethod,
      commissionSplits: request.commissionSplits,
      customerName: appointment.customerName,
      whatsapp: appointment.whatsapp,
      clientId: appointment.clientId,
      sourceType: "APPOINTMENT",
      sourceId: appointment.id,
      skipSideEffects: true,
    });

    // Sessão paga por pacote: a sessão cobre SÓ a base — receita/comissão
    // novas vêm apenas da parcela dos adicionais (split à parte).
    const packageSession = Boolean((appointment as { clientPackageId?: string | null }).clientPackageId);
    const isFiado = request.paymentMethod === "fiado";
    const completionPrice = resolved.completionPrice;
    const splits = resolved.resolvedSplits ?? [];
    const completedAt = new Date();
    let createdFiadoId: string | null = null;

    // Parcela dos adicionais (0 sem adicional → comportamento de hoje).
    // Todo cálculo financeiro usa centavos para evitar diferença de float.
    const completionPriceCents = toCents(completionPrice);
    const addonPortionCents = Math.max(0, completionPriceCents - baseCents);
    const addonPortionReais = toReais(addonPortionCents);
    // Base de comissão (FASE 3): base + Σ(commissionable). O preço final
    // explícito pode alterar o total cobrado, mas não torna um adicional
    // não comissionável comissionável. No pacote, somente a parcela dos
    // adicionais comissionáveis gera comissão.
    const commissionBaseCents = packageSession
      ? commissionBase(0, addonSnapshots)
      : commissionBase(baseCents, addonSnapshots);
    const commissionBaseReais = toReais(commissionBaseCents);

    // Status + finalPrice/paymentMethod + comissão + ledger (+ fiado) numa única
    // transação: qualquer falha reverte a conclusão inteira.
    await rlsTransaction(async (tx: AppTx) => {
      const [affected] = await tx.$executeRaw`
        UPDATE appointments
           SET status = 'COMPLETED',
               "updatedAt" = NOW(),
               "finalPrice" = ${completionPrice},
               "paymentMethod" = ${request.paymentMethod ?? null},
               "completedAt" = ${completedAt},
               "completedBy" = ${request.userId}::uuid
         WHERE id = ${request.appointmentId}::uuid
           AND status NOT IN ('COMPLETED', 'CANCELLED')
      `.then((count: number) => [count]) as [number];
      if (affected === 0) throw new AppError("Este agendamento já foi finalizado ou cancelado", 409);

      if (!packageSession) {
        if (splits.length > 0) {
          await tx.commissionEntry.createMany({
            data: splits.map((split) => ({
              barbershopId: request.barbershopId,
              appointmentId: appointment.id,
              serviceId: appointment.serviceId,
              professionalId: split.professionalId,
              percentage: split.percentage,
              amount: commissionAmount(commissionBaseReais, split.percentage),
            })),
            skipDuplicates: true,
          });
        }

        if (completionPrice > 0) {
          await recordLedgerEntry(tx, {
            barbershopId: request.barbershopId,
            kind: "SERVICE_SALE",
            amount: completionPrice,
            paymentMethod: request.paymentMethod,
            sourceType: "APPOINTMENT",
            sourceId: appointment.id,
            occurredAt: completedAt,
            professionalId: splits[0]?.professionalId ?? appointment.staffId ?? request.userId,
            clientId: resolved.clientId ?? null,
            description: appointment.serviceName ? `Atendimento: ${appointment.serviceName}` : "Atendimento",
            createdBy: request.userId,
          });
        }

        // O fiado NÃO é entrada de caixa — só o pagamento dele entra (FIADO_PAYMENT).
        if (isFiado && completionPrice > 0) {
          const fiado = await tx.fiado.create({
            data: {
              barbershopId: request.barbershopId,
              customerName: appointment.customerName,
              whatsapp: appointment.whatsapp,
              clientId: resolved.clientId ?? null,
              description: appointment.serviceName || "Atendimento",
              originalAmount: completionPrice,
              paidAmount: 0,
              status: "PENDING",
              notes: `Gerado automaticamente ao finalizar o agendamento (${appointment.id}).`,
              createdById: request.userId,
              origin: "SERVICE_COMPLETION",
            },
            select: { id: true },
          });
          createdFiadoId = fiado.id;
        }
      } else if (addonPortionCents > 0) {
        // PACOTE (FASE 3): a sessão já cobre a base — só a parcela cobrada
        // além da base gera receita no ledger e fiado, mesmo quando ela vem
        // apenas de um finalPrice explícito, sem adicional. A comissão usa
        // exclusivamente o snapshot comissionável dos adicionais.
        if (splits.length > 0 && commissionBaseCents > 0) {
          await tx.commissionEntry.createMany({
            data: splits.map((split) => ({
              barbershopId: request.barbershopId,
              appointmentId: appointment.id,
              serviceId: appointment.serviceId,
              professionalId: split.professionalId,
              percentage: split.percentage,
              amount: commissionAmount(commissionBaseReais, split.percentage),
            })),
            skipDuplicates: true,
          });
        }

        if (addonPortionCents > 0) {
          await recordLedgerEntry(tx, {
            barbershopId: request.barbershopId,
            kind: "SERVICE_SALE",
            amount: addonPortionReais,
            paymentMethod: request.paymentMethod,
            sourceType: "APPOINTMENT",
            sourceId: appointment.id,
            occurredAt: completedAt,
            professionalId: splits[0]?.professionalId ?? appointment.staffId ?? request.userId,
            clientId: resolved.clientId ?? null,
            description: appointment.serviceName
              ? `Atendimento: ${appointment.serviceName} (adicionais)`
              : "Atendimento (adicionais)",
            createdBy: request.userId,
          });
        }

        if (isFiado && addonPortionCents > 0) {
          const fiado = await tx.fiado.create({
            data: {
              barbershopId: request.barbershopId,
              customerName: appointment.customerName,
              whatsapp: appointment.whatsapp,
              clientId: resolved.clientId ?? null,
              description: appointment.serviceName || "Atendimento",
              originalAmount: addonPortionReais,
              paidAmount: 0,
              status: "PENDING",
              notes: `Gerado automaticamente ao finalizar o agendamento (${appointment.id}) — parcela dos adicionais.`,
              createdById: request.userId,
              origin: "SERVICE_COMPLETION",
            },
            select: { id: true },
          });
          createdFiadoId = fiado.id;
        }
      }
    });

    // Pós-commit: eventos de melhor esforço (idempotentes) e notificações.
    try {
      if (createdFiadoId) await recordFiadoCreated(createdFiadoId);
      await recordAppointmentCompletion(request.appointmentId);
    } catch { /* CRM não bloqueia a conclusão */ }

    if (request.retailSale) {
      await this.productCatalog.createSale(request.barbershopId, {
        id: request.userId,
        role: request.userRole,
        barbershopId: request.barbershopId,
      }, {
        paymentMethod: request.retailSale.paymentMethod,
        items: request.retailSale.items,
        discount: request.retailSale.discount,
        clientId: request.retailSale.clientId ?? appointment.clientId,
        appointmentId: appointment.id,
        idempotencyKey: request.retailSale.idempotencyKey ?? `appointment:${appointment.id}`,
        customerName: appointment.customerName,
        whatsapp: appointment.whatsapp,
      });
    }

    if (request.procedure && this.procedureRepository) {
      try {
        const clientId = appointment.clientId;
        if (clientId) {
          await this.procedureRepository.create({
            barbershopId: request.barbershopId,
            clientId,
            professionalName: request.procedure.professionalName || "Profissional",
            title: request.procedure.title,
            formula: request.procedure.formula,
            details: request.procedure.details,
            serviceName: request.procedure.serviceName ?? appointment.serviceName ?? null,
            appointmentId: appointment.id,
          });
        }
      } catch { /* procedure nao bloqueia */ }
    }

    if (!isPlaceholderWhatsApp(appointment.whatsapp)) {
      await this.completeService.notifyWhatsApp(
        appointment.barbershopId,
        appointment.whatsapp,
        `Olá ${appointment.customerName}! Seu atendimento foi finalizado. Obrigado por nos escolher! 💈`,
        {
          deduplicationKey: `appt-complete:${appointment.id}`,
          notificationType: "APPOINTMENT_COMPLETED",
          clientId: appointment.clientId,
          sourceType: "APPOINTMENT",
          sourceId: appointment.id,
        },
      );
    }

    try {
      await new ReviewInvitationService().createForAppointment(appointment.id);
    } catch { /* avaliacao nao bloqueia a conclusao */ }

    publishRealtime(request.barbershopId, "appointments:changed");
    return {
      ...appointment,
      status: "COMPLETED" as const,
      finalPrice: completionPrice,
      paymentMethod: request.paymentMethod ?? null,
      completedAt,
      completedBy: request.userId,
    };
  }
}
