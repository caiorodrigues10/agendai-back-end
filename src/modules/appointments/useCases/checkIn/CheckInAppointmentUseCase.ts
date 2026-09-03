import { injectable } from "tsyringe";
import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import { publishRealtime } from "@/shared/services/realtimeService";

const logger = getModuleLogger("appointments:check-in");

interface ICheckInDTO {
  appointmentId: string;
  barbershopId: string;
  userId: string;
  userRole: string;
}

interface ICheckInResult {
  queueItemId: string;
  appointmentId: string;
}

/**
 * Check-in atômico: valida o agendamento, cria o item da fila vinculado,
 * e marca o agendamento como CHECKED_IN — tudo em uma transação.
 * Idempotente: se o agendamento já está CHECKED_IN, retorna o queue item existente.
 */
@injectable()
export class CheckInAppointmentUseCase {
  async execute(data: ICheckInDTO): Promise<ICheckInResult> {
    const { appointmentId, barbershopId, userId, userRole } = data;

    const result = await prisma.$transaction(async (tx: typeof prisma) => {
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId },
        select: {
          id: true,
          barbershopId: true,
          serviceId: true,
          staffId: true,
          clientId: true,
          clientPackageId: true,
          customerName: true,
          whatsapp: true,
          status: true,
        },
      });

      if (!appointment) {
        throw new AppError("Agendamento não encontrado", 404);
      }

      if (appointment.barbershopId !== barbershopId) {
        throw new AppError("Acesso negado: agendamento de outro estabelecimento", 403);
      }

      if (userRole !== "MASTER_ADMIN" && userRole !== "OWNER" && userRole !== "EMPLOYEE") {
        throw new AppError("Acesso negado: permissão insuficiente", 403);
      }

      if (appointment.status === "CHECKED_IN") {
        const existing = await tx.queueItem.findFirst({
          where: { appointmentId, barbershopId },
          select: { id: true },
        });
        if (existing) {
          return { queueItemId: existing.id, appointmentId };
        }
      }

      if (appointment.status !== "CONFIRMED") {
        throw new AppError(
          `Não é possível fazer check-in: agendamento está com status ${appointment.status}`,
          409
        );
      }

      const duplicate = await tx.queueItem.findFirst({
        where: {
          barbershopId,
          status: { in: ["WAITING", "IN_CHAIR"] },
          appointmentId: null,
          ...(appointment.clientId
            ? { clientId: appointment.clientId }
            : { whatsapp: appointment.whatsapp }),
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new AppError(
          "Cliente já está na fila. Finalize o atendimento atual antes de fazer check-in.",
          409
        );
      }

      const queueItem = await tx.queueItem.create({
        data: {
          barbershopId,
          serviceId: appointment.serviceId,
          customerId: randomUUID(),
          clientId: appointment.clientId,
          customerName: appointment.customerName,
          whatsapp: appointment.whatsapp,
          status: "IN_CHAIR",
          addedByStaff: true,
          appointmentId,
        },
        select: { id: true },
      });

      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: "CHECKED_IN" },
      });

      logger.info(
        {
          appointmentId,
          queueItemId: queueItem.id,
          barbershopId,
          userId,
        },
        "Check-in realizado com sucesso"
      );

      return { queueItemId: queueItem.id, appointmentId };
    });
    publishRealtime(barbershopId, "appointments:changed");
    publishRealtime(barbershopId, "queue:changed");
    return result;
  }
}
