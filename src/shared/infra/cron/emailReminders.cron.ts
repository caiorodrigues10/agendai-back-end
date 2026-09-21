/**
 * Lembretes de término de trial e resumo diário da agenda.
 * Roda diariamente às 09h00 no fuso 'America/Sao_Paulo'.
 *
 * - trialEnding: TRIALING subscritas a terminar em 3 dias exatos.
 * - dailyDigest: agendamentos confirmados para hoje, em formato operacional.
 */

import cron from "node-cron";
import { prisma } from "@/libs/prismaClient";
import { enqueueEmail } from "@/shared/infra/queue/emailQueue";
import { getOwnerContactForBarbershop } from "@/modules/email/services/ownerContact";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("cron:email-reminders");
const TZ = "America/Sao_Paulo";
const TRIAL_WARNING_DAYS = 3;

/** Data YYYY-MM-DD no fuso America/Sao_Paulo. */
function todayInSaoPaulo(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replace(/(\d{4})\/(\d{2})\/(\d{2})/, "$1-$2-$3");
}

// ─── Trial ending ──────────────────────────────────────────────

async function runTrialEndingReminders(): Promise<number> {
  const now = new Date();
  const endDateMin = new Date(now);
  endDateMin.setDate(endDateMin.getDate() + TRIAL_WARNING_DAYS);
  endDateMin.setHours(0, 0, 0, 0);

  const endDateMax = new Date(now);
  endDateMax.setDate(endDateMax.getDate() + TRIAL_WARNING_DAYS);
  endDateMax.setHours(23, 59, 59, 999);

  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: "TRIALING",
      endDate: {
        gte: endDateMin,
        lte: endDateMax,
      },
    },
    include: {
      plan: { select: { id: true, name: true, price: true } },
      barbershop: { select: { id: true } },
    },
  });

  let sent = 0;
  for (const sub of subscriptions) {
    const barbershop = sub.barbershop;
    if (!barbershop) continue;

    const owner = await getOwnerContactForBarbershop(barbershop.id);
    if (!owner) continue;

    const daysLeft = Math.ceil(
      (sub.endDate!.getTime() - now.getTime()) / 86_400_000
    );

    try {
      await enqueueEmail({
        kind: "subscription_trial_ending",
        ownerName: owner.name,
        email: owner.email,
        planName: sub.plan.name,
        amount: sub.plan.price,
        daysLeft,
        deduplicationKey: `trial-ending:${sub.id}:${daysLeft}`,
      });
      sent++;
    } catch (err) {
      logger.error({ err, subscriptionId: sub.id }, "Failed to queue trial-ending reminder");
    }
  }

  if (sent > 0) {
    logger.info({ sent }, "Trial-ending reminders queued");
  }
  return sent;
}

// ─── Daily digest ─────────────────────────────────────────────

async function runDailyDigest(): Promise<number> {
  const today = todayInSaoPaulo(0);

  // Apenas salões com dono ativo e com agendamentos confirmados hoje.
  // Limitamos a 200 salões por execução para evitar sobrecarga de API.
  const shops = await prisma.barbershop.findMany({
    where: {
      appointments: {
        some: { date: new Date(today), status: "CONFIRMED" },
      },
    },
    select: { id: true, name: true },
    take: 200,
  });

  let sent = 0;
  for (const shop of shops) {
    const owner = await getOwnerContactForBarbershop(shop.id);
    if (!owner) continue;

    const appointments = await prisma.appointment.findMany({
      where: {
        barbershopId: shop.id,
        date: new Date(today),
        status: "CONFIRMED",
      },
      include: {
        service: { select: { name: true, price: true } },
        staff: { select: { name: true } },
      },
      orderBy: { time: "asc" },
    });

    if (appointments.length === 0) continue;

    const cancelledToday = await prisma.appointment.count({
      where: {
        barbershopId: shop.id,
        date: new Date(today),
        status: "CANCELLED",
        cancellationSource: "CUSTOMER",
      },
    });

    try {
      await enqueueEmail({
        kind: "daily_digest",
        ownerName: owner.name,
        email: owner.email,
        barbershopName: shop.name,
        date: today,
        appointments: appointments.map((a: (typeof appointments)[number]) => ({
          time: a.time,
          clientName: a.customerName,
          serviceName: a.service.name,
          price: a.service.price,
          staffName: a.staff?.name ?? undefined,
        })),
        totalScheduled: appointments.length,
        cancelledToday,
        deduplicationKey: `digest:${shop.id}:${today}`,
      });
      sent++;
    } catch (err) {
      logger.error({ err, barbershopId: shop.id }, "Failed to queue daily digest");
    }
  }

  if (sent > 0) {
    logger.info({ sent }, "Daily digests queued");
  }
  return sent;
}

// ─── Scheduler ────────────────────────────────────────────────

export function scheduleEmailReminders(): void {
  cron.schedule(
    "0 9 * * *",
    async () => {
      try {
        await runTrialEndingReminders();
        await runDailyDigest();
      } catch (err) {
        logger.error({ err }, "Email reminder cron failed");
      }
    },
    { timezone: TZ }
  );
  logger.info("Email reminders scheduler registered (09:00 America/Sao_Paulo)");
}
