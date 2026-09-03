import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IAppointmentRepository } from "../../repositories/IAppointmentRepository";
import { CompleteServiceUseCase } from "@/modules/shared/useCases/CompleteServiceUseCase";
import { ProductCatalogUseCase } from "@/modules/products/useCases/productUseCases";
import { isPlaceholderWhatsApp } from "@/modules/queue/utils/queueDuplicate";
import { publishRealtime } from "@/shared/services/realtimeService";

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
}

@injectable()
export class CompleteAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository") private appointmentRepository: IAppointmentRepository,
    @inject(CompleteServiceUseCase) private completeService: CompleteServiceUseCase,
    @inject(ProductCatalogUseCase) private productCatalog: ProductCatalogUseCase,
  ) {}

  async execute(request: CompleteAppointmentRequest) {
    const appointment = await this.appointmentRepository.findById(request.appointmentId);
    if (!appointment) throw new AppError("Agendamento não encontrado", 404);
    if (appointment.barbershopId !== request.barbershopId) throw new AppError("Agendamento não pertence a este salão", 403);
    if (appointment.status === "COMPLETED") throw new AppError("Este agendamento já foi finalizado", 409);
    if (appointment.status === "CANCELLED") throw new AppError("Não é possível finalizar um agendamento cancelado", 400);

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
      skipRecordCompletion: true,
    });

    const updated = await this.appointmentRepository.update(appointment.id, {
      status: "COMPLETED",
    });

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
    return updated;
  }
}
