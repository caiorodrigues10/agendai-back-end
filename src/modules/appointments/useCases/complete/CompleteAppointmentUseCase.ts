import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IAppointmentRepository } from "../../repositories/IAppointmentRepository";
import { CompleteServiceUseCase } from "@/modules/shared/useCases/CompleteServiceUseCase";
import { ProductCatalogUseCase } from "@/modules/products/useCases/productUseCases";
import { IProcedureRecordRepository } from "@/modules/clients/repositories/ProcedureRecordRepository";
import { isPlaceholderWhatsApp } from "@/modules/queue/utils/queueDuplicate";
import { publishRealtime } from "@/shared/services/realtimeService";

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
    if (request.userRole !== "MASTER_ADMIN" && request.userRole !== "OWNER" && request.userRole !== "EMPLOYEE" && request.userRole !== "ADMIN") {
      throw new AppError("Você não possui permissão para finalizar atendimentos", 403);
    }
    const appointment = await this.appointmentRepository.findById(request.appointmentId);
    if (!appointment) throw new AppError("Agendamento não encontrado", 404);
    if (appointment.barbershopId !== request.barbershopId) throw new AppError("Agendamento não pertence a este salão", 403);
    if (appointment.status === "COMPLETED") throw new AppError("Este agendamento já foi finalizado", 409);
    if (appointment.status === "CANCELLED") throw new AppError("Não é possível finalizar um agendamento cancelado", 400);

    const [affected] = await prisma.$executeRaw`
      UPDATE appointments SET status = 'COMPLETED', "updatedAt" = NOW()
      WHERE id = ${request.appointmentId}::uuid
        AND status NOT IN ('COMPLETED', 'CANCELLED')
    `.then((count: number) => [count]) as [number];
    if (affected === 0) throw new AppError("Este agendamento já foi finalizado ou cancelado", 409);

    try {
      await this.completeService.execute({
        barbershopId: request.barbershopId,
        serviceName: appointment.serviceName,
        serviceId: appointment.serviceId,
        staffUserId: request.userId,
        finalPrice: request.finalPrice ?? appointment.servicePrice ?? undefined,
        paymentMethod: request.paymentMethod,
        commissionSplits: request.commissionSplits,
        customerName: appointment.customerName,
        whatsapp: appointment.whatsapp,
        clientId: appointment.clientId,
        sourceType: "APPOINTMENT",
        sourceId: appointment.id,
      });
    } catch (error) {
      await prisma.appointment.update({
        where: { id: request.appointmentId },
        data: { status: appointment.status },
      }).catch(() => undefined);
      throw error;
    }

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

    publishRealtime(request.barbershopId, "appointments:changed");
    return { ...appointment, status: "COMPLETED" as const };
  }
}
