import { prisma } from "@/libs/prismaClient";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { getShopTimezone } from "@/modules/financial/ledger/shopTime";
import { getFrontendUrl } from "@/shared/constants/env";
import { createPublicAppointmentToken } from "../../services/publicAppointmentToken";
import { getModuleLogger } from "@/shared/utils/logger";
import {
  buildLateClientMessage,
  buildLateStaffMessage,
  civilDayOfWeek,
  civilInstantInTimezone,
  lateAlertDedupKey,
  LATE_IMPATIENT_WINDOW_MINUTES,
  resolveLateAlertLevel,
  LateAlertLevel,
} from "../../services/lateAlerts";

const logger = getModuleLogger("appointments:late-alerts");

export interface LateAlertsReport {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
  byLevel: { l1: number; l2: number; l3: number };
}

interface ShopContext {
  timezone: string;
  toleranceMinutes: number;
  closeTime: string | null;
  closeAt: Date | null;
  shopName: string;
  ownerPhone: string | null;
  instanceName: string | null;
  /** Data civil de "hoje" no fuso do salão (yyyy-mm-dd) — o filtro por dia. */
  todayKey: string;
}

/**
 * Varredura de agendamentos atrasados (L1/L2/L3), disparada pelo cron
 * `late-appointments-alert` a cada minuto. Cada mensagem usa chave de
 * deduplicação late{nível}:{appointmentId} → repetir a varredura é inócuo.
 */
export async function runLateAppointmentAlerts(now = new Date()): Promise<LateAlertsReport> {
  const report: LateAlertsReport = { scanned: 0, sent: 0, skipped: 0, failed: 0, byLevel: { l1: 0, l2: 0, l3: 0 } };

  // Janela larga cobre viradas de fuso; o filtro fino acontece por salão
  // (cada qual com SUA data civil de hoje).
  const dayMs = 86_400_000;
  const candidates = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      date: { gte: new Date(now.getTime() - dayMs), lte: new Date(now.getTime() + dayMs) },
    },
    select: {
      id: true,
      barbershopId: true,
      customerName: true,
      whatsapp: true,
      time: true,
      date: true,
      clientId: true,
      publicAccessVersion: true,
      service: { select: { name: true } },
    },
  });

  const shopCtx = new Map<string, ShopContext | null>();

  for (const appt of candidates) {
    report.scanned++;
    try {
      let ctx = shopCtx.get(appt.barbershopId);
      if (ctx === undefined) {
        ctx = await loadShopContext(appt.barbershopId, appt.date, now);
        shopCtx.set(appt.barbershopId, ctx);
      }
      if (!ctx) {
        report.skipped++;
        continue;
      }

      // Data civil do agendamento (armazenada como meia-noite UTC do dia) —
      // continua sendo o "hoje" do salão no fuso dele; fora disso, ignora.
      const iso = appt.date.toISOString().slice(0, 10);
      const [y, mo, d] = iso.split("-").map(Number);
      if (ctx.todayKey !== iso) {
        report.skipped++;
        continue;
      }

      const [hh, mm] = (appt.time || "00:00").split(":").map((n) => Number(n) || 0);
      const appointmentAt = civilInstantInTimezone(y, mo, d, hh, mm, ctx.timezone);
      const level = resolveLateAlertLevel({
        now,
        appointmentAt,
        toleranceMinutes: ctx.toleranceMinutes,
        closeAt: ctx.closeAt,
      });
      if (level === 0) {
        report.skipped++;
        continue;
      }

      const lateMinutes = Math.max(1, Math.round((now.getTime() - appointmentAt.getTime()) / 60_000));
      const impatient =
        ctx.closeAt !== null &&
        now.getTime() < ctx.closeAt.getTime() &&
        ctx.closeAt.getTime() - now.getTime() <= LATE_IMPATIENT_WINDOW_MINUTES * 60_000;

      const manageUrl =
        level === 3
          ? `${getFrontendUrl()}/agendamento/gerenciar?token=${createPublicAppointmentToken(
              appt.id,
              appt.barbershopId,
              appt.publicAccessVersion ?? 1
            )}`
          : null;

      const msgCtx = {
        customerName: appt.customerName,
        shopName: ctx.shopName,
        serviceName: appt.service?.name ?? "",
        scheduledTime: appt.time,
        lateMinutes,
        closeTime: ctx.closeTime,
        manageUrl,
      };

      const clientMessage = buildLateClientMessage(level as 1 | 2 | 3, msgCtx, impatient);
      const staffMessage = buildLateStaffMessage(level as 1 | 2 | 3, msgCtx);
      const key = lateAlertDedupKey(level as 1 | 2 | 3, appt.id);

      // Cliente: só se houver um WhatsApp utilizável e uma instância viva.
      if (appt.whatsapp && appt.whatsapp.trim() && ctx.instanceName) {
        await enqueueWhatsApp({
          phone: appt.whatsapp,
          message: clientMessage,
          instanceName: ctx.instanceName,
          deduplicationKey: `${key}:client`,
          notificationType: notificationTypeFor(level),
          barbershopId: appt.barbershopId,
          clientId: appt.clientId ?? undefined,
          sourceType: "APPOINTMENT",
          sourceId: appt.id,
        });
      }

      // Dono do salão: destino operacional (alerta de fila → whatsapp do salão).
      if (ctx.ownerPhone && ctx.instanceName) {
        await enqueueWhatsApp({
          phone: ctx.ownerPhone,
          message: staffMessage,
          instanceName: ctx.instanceName,
          deduplicationKey: `${key}:staff`,
          notificationType: notificationTypeFor(level),
          barbershopId: appt.barbershopId,
          sourceType: "APPOINTMENT",
          sourceId: appt.id,
        });
      }

      report.sent++;
      report.byLevel[(`l${level}`) as "l1" | "l2" | "l3"]++;
    } catch (err) {
      // Um agendamento com problema não aborta o lote (mesma convenção dos lembretes).
      logger.warn({ err, appointmentId: appt.id }, "Falha ao processar alerta de atraso");
      report.failed++;
    }
  }

  return report;
}

function notificationTypeFor(level: LateAlertLevel): "APPOINTMENT_LATE_ALERT" | "APPOINTMENT_LATE_FINAL" | "APPOINTMENT_LATE_CLOSE" {
  if (level === 1) return "APPOINTMENT_LATE_ALERT";
  if (level === 2) return "APPOINTMENT_LATE_FINAL";
  return "APPOINTMENT_LATE_CLOSE";
}

type ShopContextWithDay = ShopContext;

/** Carrega fuso, policy, schedule do dia e dados de contato do salão (cacheado por varredura). */
async function loadShopContext(barbershopId: string, anyAppointmentDate: Date, now: Date): Promise<ShopContextWithDay | null> {
  const shop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: {
      name: true,
      whatsapp: true,
      queueAlertPhone: true,
      evolutionInstanceName: true,
    },
  });
  if (!shop) return null;

  const timezone = await getShopTimezone(barbershopId);

  // "Hoje" do salão: data civil do agora no fuso dele.
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  const [y, mo, d] = todayKey.split("-").map(Number);
  const dayOfWeek = civilDayOfWeek(y, mo, d);

  const [schedule, policy] = await Promise.all([
    prisma.schedule.findFirst({ where: { barbershopId, dayOfWeek }, select: { isOpen: true, closeTime: true } }),
    prisma.appointmentPolicy.findUnique({ where: { barbershopId }, select: { lateToleranceMinutes: true } }),
  ]);

  const closeTime = schedule?.isOpen ? schedule.closeTime : null;
  let closeAt: Date | null = null;
  if (closeTime) {
    const [ch, cm] = closeTime.split(":").map(Number);
    closeAt = civilInstantInTimezone(y, mo, d, ch || 0, cm || 0, timezone);
  }

  return {
    timezone,
    toleranceMinutes: policy?.lateToleranceMinutes ?? 15,
    closeTime,
    closeAt,
    shopName: shop.name,
    ownerPhone: (shop.queueAlertPhone?.trim() || shop.whatsapp?.trim()) || null,
    instanceName: shop.evolutionInstanceName?.trim() || null,
    todayKey,
  };
}
