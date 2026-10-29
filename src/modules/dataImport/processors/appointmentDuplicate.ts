/**
 * Identidade de um agendamento na agenda.
 *
 * Chave: salão + serviço + dia + hora + cliente. Cliente com telefone é
 * comparado pelo CRM; sem telefone, pelo nome. É o que impede reimportar o
 * mesmo arquivo de duplicar a agenda.
 */
import type { AppTx } from "@/libs/prismaClient";

export interface AppointmentIdentity {
  serviceId: string;
  clientId: string | null;
  phone: string | null;
  customerName: string;
  /** Dia do atendimento (YYYY-MM-DD já normalizado). */
  date: string;
  /** Horário (HH:mm já normalizado). */
  time: string;
}

/** Agendamento equivalente já existente na agenda (ou null). */
export async function findDuplicateAppointment(
  tx: AppTx,
  barbershopId: string,
  identity: AppointmentIdentity,
): Promise<{ id: string } | null> {
  const dayStart = new Date(`${identity.date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const client = identity.clientId
    ? { clientId: identity.clientId }
    : identity.phone
      ? { whatsapp: identity.phone }
      : { customerName: identity.customerName };

  return tx.appointment.findFirst({
    where: {
      barbershopId,
      serviceId: identity.serviceId,
      time: identity.time,
      date: { gte: dayStart, lt: dayEnd },
      ...client,
    },
    select: { id: true },
  });
}
