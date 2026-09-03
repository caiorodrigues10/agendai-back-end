import { Prisma } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { assertAppointmentBookable } from "../../utils/assertAppointmentBookable";
import { createPublicAppointmentToken, readPublicAppointmentToken } from "../../services/publicAppointmentToken";

function appointmentInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00-03:00`);
}

async function getAppointment(id: string, barbershopId: string, version: number) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, barbershopId },
    include: {
      service: { select: { name: true, price: true, avgTimeMinutes: true } },
      staff: { select: { name: true } },
      barbershop: { select: { name: true, address: true, city: true } },
    },
  });
  if (!appointment || appointment.publicAccessVersion !== version) {
    throw new AppError("Link de agendamento inválido ou expirado", 401, undefined, "INVALID_APPOINTMENT_TOKEN");
  }
  return appointment;
}

export class PublicAppointmentManagementUseCase {
  async exchange(token: string) {
    const payload = readPublicAppointmentToken(token, "manage");
    const appointment = await getAppointment(payload.sub, payload.barbershopId, payload.version);
    return {
      appointment,
      sessionToken: createPublicAppointmentToken(appointment.id, appointment.barbershopId, appointment.publicAccessVersion, "session"),
    };
  }

  async get(sessionToken: string) {
    const payload = readPublicAppointmentToken(sessionToken, "session");
    return getAppointment(payload.sub, payload.barbershopId, payload.version);
  }

  async cancel(sessionToken: string, reason?: string) {
    const appointment = await this.get(sessionToken);
    if (appointment.status !== "CONFIRMED") throw new AppError("Este agendamento não pode mais ser cancelado", 409, undefined, "APPOINTMENT_NOT_CHANGEABLE");
    const policy = await prisma.appointmentPolicy.upsert({
      where: { barbershopId: appointment.barbershopId },
      create: { barbershopId: appointment.barbershopId },
      update: {},
    });
    if (!policy.allowPublicCancellation || appointmentInstant(appointment.date.toISOString().slice(0, 10), appointment.time).getTime() - Date.now() < policy.cancelNoticeMinutes * 60_000) {
      throw new AppError("O prazo para cancelar este agendamento foi encerrado", 409, undefined, "APPOINTMENT_CHANGE_DEADLINE");
    }
    return prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: "CANCELLED", canceledAt: new Date(), cancellationSource: "CUSTOMER", cancellationReason: reason?.slice(0, 300) },
      include: { service: { select: { name: true, price: true } }, staff: { select: { name: true } }, barbershop: { select: { name: true } } },
    });
  }

  async reschedule(sessionToken: string, date: string, time: string) {
    const appointment = await this.get(sessionToken);
    if (appointment.status !== "CONFIRMED") throw new AppError("Este agendamento não pode mais ser remarcado", 409, undefined, "APPOINTMENT_NOT_CHANGEABLE");
    const policy = await prisma.appointmentPolicy.upsert({ where: { barbershopId: appointment.barbershopId }, create: { barbershopId: appointment.barbershopId }, update: {} });
    if (!policy.allowPublicReschedule || appointmentInstant(appointment.date.toISOString().slice(0, 10), appointment.time).getTime() - Date.now() < policy.rescheduleNoticeMinutes * 60_000) {
      throw new AppError("O prazo para remarcar este agendamento foi encerrado", 409, undefined, "APPOINTMENT_CHANGE_DEADLINE");
    }

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await assertAppointmentBookable({ barbershopId: appointment.barbershopId, serviceId: appointment.serviceId, staffId: appointment.staffId, customerName: appointment.customerName, whatsapp: appointment.whatsapp, date, time }, tx);
      return tx.appointment.update({
        where: { id: appointment.id },
        data: { date: new Date(date), time, publicAccessVersion: { increment: 1 } },
        include: { service: { select: { name: true, price: true } }, staff: { select: { name: true } }, barbershop: { select: { name: true } } },
      });
    });
    return { appointment: updated, manageToken: createPublicAppointmentToken(updated.id, updated.barbershopId, updated.publicAccessVersion) };
  }
}
