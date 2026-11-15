import { prisma, type AppTx } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { assertAppointmentBookable } from "../../utils/assertAppointmentBookable";
import {
  addonResponseFields,
  addonRowToSnapshot,
  type AppointmentAddonRow,
} from "../../utils/appointmentAddons";
import type { AddonSnapshot } from "@/modules/addons";
import { createPublicAppointmentToken, readPublicAppointmentToken } from "../../services/publicAppointmentToken";
import { publishRealtime } from "@/shared/services/realtimeService";
import { enqueueEmail } from "@/shared/infra/queue/emailQueue";
import { getOwnerContactForBarbershop } from "@/modules/email/services/ownerContact";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("appointments:public-management");

const URGENT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

function appointmentInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00-03:00`);
}

/**
 * Campos expostos ao cliente do agendamento.
 *
 * `caseId`, `caseName` e `practiceArea` ficam de fora de propósito: dados de
 * caso/processo são internos do escritório e nunca vão para o portal público.
 * `addons` (FASE 3) entra com select — apresentado só quando não vazio
 * (`presentPublicAppointment`), mantendo a resposta idêntica sem adicional.
 */
const publicAppointmentSelect = {
  id: true,
  barbershopId: true,
  serviceId: true,
  staffId: true,
  customerName: true,
  whatsapp: true,
  date: true,
  time: true,
  status: true,
  reminderSentAt: true,
  createdAt: true,
  updatedAt: true,
  publicAccessVersion: true,
  source: true,
  clientId: true,
  clientPackageId: true,
  petId: true,
  petName: true,
  modality: true,
  meetingLink: true,
  service: { select: { name: true, price: true, avgTimeMinutes: true } },
  staff: { select: { name: true } },
  barbershop: { select: { name: true, address: true, city: true } },
  client: { select: { name: true } },
  addons: {
    select: {
      addonId: true,
      nameSnapshot: true,
      unitPrice: true,
      quantity: true,
      durationMinutes: true,
      commissionable: true,
    },
  },
} as const;

type PublicAppointmentRow = {
  service: { name: string; price: number; avgTimeMinutes: number } | null;
  addons?: AppointmentAddonRow[];
};

/**
 * FASE 3 item 7: sem adicional devolve a linha EXATAMENTE como hoje (sem a
 * chave `addons`); com adicional anexa `addons` + `totalPrice` +
 * `totalDurationMinutes`.
 */
function presentPublicAppointment<T extends PublicAppointmentRow>(row: T) {
  const { addons, ...rest } = row as T & { addons?: AppointmentAddonRow[] };
  if (!addons || addons.length === 0) {
    return rest as Omit<T, "addons">;
  }
  return { ...rest, ...addonResponseFields(row.service, addons) };
}

/** Snapshots já gravados no agendamento (remarcação revalida com eles). */
function snapshotsOf(row: unknown): AddonSnapshot[] {
  const addons = (row as { addons?: AppointmentAddonRow[] }).addons;
  return (addons ?? []).map(addonRowToSnapshot);
}

async function getAppointment(id: string, barbershopId: string, version: number) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, barbershopId },
    select: publicAppointmentSelect,
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
      appointment: presentPublicAppointment(appointment),
      sessionToken: createPublicAppointmentToken(appointment.id, appointment.barbershopId, appointment.publicAccessVersion, "session"),
    };
  }

  async get(sessionToken: string) {
    const payload = readPublicAppointmentToken(sessionToken, "session");
    return presentPublicAppointment(
      await getAppointment(payload.sub, payload.barbershopId, payload.version)
    );
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
    const cancelled = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: "CANCELLED", canceledAt: new Date(), cancellationSource: "CUSTOMER", cancellationReason: reason?.slice(0, 300) },
      select: publicAppointmentSelect,
    });
    publishRealtime(appointment.barbershopId, "appointments:changed");

    // Se o cancelamento é nas próximas 24h, notifica o salão — dono precisa
    // reagendar ou abrir a vaga para outra cliente.
    const msUntilAppointment = appointmentInstant(
      cancelled.date.toISOString().slice(0, 10),
      cancelled.time
    ).getTime() - Date.now();

    if (msUntilAppointment >= 0 && msUntilAppointment < URGENT_WINDOW_MS) {
      void getOwnerContactForBarbershop(cancelled.barbershopId)
        .then((owner) => {
          if (!owner) return;
          return enqueueEmail({
            kind: "appointment_urgent_cancelled",
            ownerName: owner.name,
            email: owner.email,
            cancelledBy: "CLIENTE",
            clientName: cancelled.customerName ?? cancelled.client?.name ?? undefined,
            serviceName: cancelled.service?.name,
            originalTime: cancelled.time,
            deduplicationKey: `appt-cancelled:${cancelled.id}`,
          });
        })
        .catch((err) =>
          logger.error({ err, appointmentId: cancelled.id }, "Failed to queue urgent cancel email")
        );
    }

    return presentPublicAppointment(cancelled);
  }

  async reschedule(sessionToken: string, date: string, time: string) {
    const appointment = await this.get(sessionToken);
    if (appointment.status !== "CONFIRMED") throw new AppError("Este agendamento não pode mais ser remarcado", 409, undefined, "APPOINTMENT_NOT_CHANGEABLE");
    const policy = await prisma.appointmentPolicy.upsert({ where: { barbershopId: appointment.barbershopId }, create: { barbershopId: appointment.barbershopId }, update: {} });
    if (!policy.allowPublicReschedule || appointmentInstant(appointment.date.toISOString().slice(0, 10), appointment.time).getTime() - Date.now() < policy.rescheduleNoticeMinutes * 60_000) {
      throw new AppError("O prazo para remarcar este agendamento foi encerrado", 409, undefined, "APPOINTMENT_CHANGE_DEADLINE");
    }

    const updated = await prisma.$transaction(async (tx: AppTx) => {
      // FASE 3 item 4: revalida com a duração que inclui os snapshots do
      // PRÓPRIO agendamento (mesmos valores gravados na criação).
      await assertAppointmentBookable(
        { barbershopId: appointment.barbershopId, serviceId: appointment.serviceId, staffId: appointment.staffId, customerName: appointment.customerName, whatsapp: appointment.whatsapp, date, time },
        tx,
        { excludeAppointmentId: appointment.id, addonSnapshots: snapshotsOf(appointment) }
      );
      return tx.appointment.update({
        where: { id: appointment.id },
        data: { date: new Date(date), time, publicAccessVersion: { increment: 1 } },
        select: publicAppointmentSelect,
      });
    });
    publishRealtime(updated.barbershopId, "appointments:changed");

    // Se a remarcação alterou um horário nas próximas 24h, avisa o salão.
    const oldMsUntil = appointmentInstant(
      appointment.date.toISOString().slice(0, 10),
      appointment.time,
    ).getTime() - Date.now();
    if (oldMsUntil >= 0 && oldMsUntil < URGENT_WINDOW_MS) {
      void getOwnerContactForBarbershop(updated.barbershopId)
        .then((owner) => {
          if (!owner) return;
          return enqueueEmail({
            kind: "appointment_urgent_rescheduled",
            ownerName: owner.name,
            email: owner.email,
            originalTime: appointment.time,
            newTime: updated.time,
            clientName: updated.customerName ?? updated.client?.name ?? undefined,
            serviceName: updated.service?.name,
            deduplicationKey: `appt-rescheduled:${appointment.id}:${updated.time}`,
          });
        })
        .catch((err) =>
          logger.error({ err, appointmentId: appointment.id }, "Failed to queue urgent reschedule email")
        );
    }

    return { appointment: presentPublicAppointment(updated), manageToken: createPublicAppointmentToken(updated.id, updated.barbershopId, updated.publicAccessVersion) };
  }
}
