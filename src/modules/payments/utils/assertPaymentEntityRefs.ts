import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

/**
 * Garante que service/appointment/queueItem referenciados no pagamento
 * pertençam ao mesmo barbershopId (anti cross-tenant).
 */
export async function assertPaymentEntityRefs(input: {
  barbershopId: string;
  serviceId?: string | null;
  appointmentId?: string | null;
  queueItemId?: string | null;
}): Promise<void> {
  const { barbershopId, serviceId, appointmentId, queueItemId } = input;

  if (serviceId) {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, barbershopId },
      select: { id: true },
    });
    if (!service) {
      throw new AppError(
        "serviceId não pertence a este estabelecimento",
        400
      );
    }
  }

  if (appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, barbershopId },
      select: { id: true },
    });
    if (!appointment) {
      throw new AppError(
        "appointmentId não pertence a este estabelecimento",
        400
      );
    }
  }

  if (queueItemId) {
    const item = await prisma.queueItem.findFirst({
      where: { id: queueItemId, barbershopId },
      select: { id: true },
    });
    if (!item) {
      throw new AppError(
        "queueItemId não pertence a este estabelecimento",
        400
      );
    }
  }
}
