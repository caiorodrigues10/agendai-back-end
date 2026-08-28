import cron from "node-cron";
import { prisma } from "@/libs/prismaClient";
import {
  buildPostSvg,
  pngToDataUrl,
  renderPostSvgToPng,
} from "@/modules/posts/services/postImageService";
import { broadcastPostToClients } from "@/modules/posts/services/postBroadcastService";

type CronLogger = {
  info: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
  warn?: (obj: object | string, msg?: string) => void;
};

const SAO_PAULO_TZ = "America/Sao_Paulo";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Data/hora atuais no fuso America/Sao_Paulo (dia da semana, HH:MM e YYYY-MM-DD). */
function nowInSaoPaulo() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date())) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    dayOfWeek: WEEKDAY_INDEX[parts.weekday],
    time: `${parts.hour}:${parts.minute}`,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** Formata uma data como YYYY-MM-DD no fuso America/Sao_Paulo. */
function dateKeyInSaoPaulo(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Publica posts agendados vencidos e gera auto-posts no horário de abertura. */
async function runPostPublisherTick(log: CronLogger) {
  const scheduledPosts = await prisma.feedPost.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } },
    select: { id: true, barbershopId: true, title: true, ctaText: true },
  });

  for (const post of scheduledPosts) {
    try {
      await prisma.feedPost.update({
        where: { id: post.id },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });

      broadcastPostToClients(
        post.barbershopId,
        post.id,
        post.title ?? "Vem pra cá hoje!",
        post.ctaText ?? null
      ).catch((err) => log.error({ err, postId: post.id }, "Broadcast post failed"));
    } catch (err) {
      log.error({ err, postId: post.id }, "Falha ao publicar post agendado");
    }
  }

  if (scheduledPosts.length > 0) {
    log.info({ count: scheduledPosts.length }, "Posts agendados publicados pelo cron");
  }

  const now = nowInSaoPaulo();
  const shops = await prisma.barbershop.findMany({
    where: { autoPostEnabled: true },
    select: {
      id: true,
      name: true,
      logoUrl: true,
      autoPostLastDate: true,
    },
  });

  for (const shop of shops) {
    try {
      const schedule = await prisma.schedule.findFirst({
        where: { barbershopId: shop.id, dayOfWeek: now.dayOfWeek },
        select: { isOpen: true, openTime: true, closeTime: true },
      });

      const lastAutoPostDay = shop.autoPostLastDate
        ? dateKeyInSaoPaulo(shop.autoPostLastDate)
        : null;

      if (
        !schedule ||
        !schedule.isOpen ||
        schedule.openTime !== now.time ||
        lastAutoPostDay === now.dateKey
      ) {
        continue;
      }

      const services = await prisma.service.findMany({
        where: { barbershopId: shop.id, active: true },
        select: { name: true, price: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      });

      const title = `Abrimos às ${schedule.openTime}! Vem pra cá!`;
      const ctaText = "Entrar na fila";
      const svg = buildPostSvg({
        shopName: shop.name,
        logoUrl: shop.logoUrl,
        services,
        todaySchedule: {
          isOpen: true,
          openTime: schedule.openTime,
          closeTime: schedule.closeTime,
        },
        postMode: "both",
        ctaText,
        title,
      });
      const imageUrl = pngToDataUrl(renderPostSvgToPng(svg));

      const createdPost = await prisma.feedPost.create({
        data: {
          barbershopId: shop.id,
          authorId: null,
          type: "ANNOUNCEMENT",
          title,
          content: "",
          imageUrl,
          status: "PUBLISHED",
          postMode: "BOTH",
          ctaText,
          publishedAt: new Date(),
        },
      });

      broadcastPostToClients(
        shop.id,
        createdPost.id,
        title,
        ctaText
      ).catch((err) => log.error({ err, postId: createdPost.id }, "Broadcast auto-post failed"));

      await prisma.barbershop.update({
        where: { id: shop.id },
        data: { autoPostLastDate: new Date() },
      });

      log.info(
        { barbershopId: shop.id, openTime: schedule.openTime },
        "Auto-post de abertura publicado"
      );
    } catch (err) {
      log.error(
        { err, barbershopId: shop.id },
        "Falha ao gerar auto-post de abertura"
      );
    }
  }
}

/**
 * Agenda a publicação automática de posts a cada minuto (America/Sao_Paulo).
 * - Publica posts SCHEDULED com scheduledFor vencido;
 * - Gera auto-post no horário de abertura do salão (1x por dia);
 * - Erros só são logados; nunca derrubam o processo.
 */
export function schedulePostPublisher(log: CronLogger): void {
  try {
    cron.schedule(
      "*/1 * * * *",
      async () => {
        try {
          await runPostPublisherTick(log);
        } catch (err) {
          log.error({ err }, "Falha ao rodar cron de publicação de posts");
        }
      },
      { timezone: SAO_PAULO_TZ }
    );
    log.info(
      { schedule: "*/1 * * * *", timezone: SAO_PAULO_TZ },
      "Cron de publicação de posts agendado"
    );
  } catch (err) {
    log.error?.({ err }, "Não foi possível agendar cron de publicação de posts");
  }
}