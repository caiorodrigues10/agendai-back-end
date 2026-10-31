/**
 * Abas de relacionamento: Fila, Lista de espera, Avaliações, Fidelidade,
 * Indicações, Vouchers e Posts/Galeria.
 */
import { prisma } from "@/libs/prismaClient";
import {
  addRow,
  setupSheet,
  WEEKDAY_LABELS,
  type ColumnSpec,
  type SheetBuilder,
  type SheetTarget,
  type SheetContext,
} from "../sheetHelpers";
import { anonymizeName, anonymizePhone } from "../../utils/cellSafety";

/** ── Fila ─────────────────────────────────────────────────────────────────── */

const QUEUE_COLUMNS: ColumnSpec[] = [
  { header: "Entrada", type: "datetime", width: 18 },
  { header: "Chamada", type: "datetime", width: 18 },
  { header: "Início do atendimento", type: "datetime", width: 20 },
  { header: "Fim do atendimento", type: "datetime", width: 20 },
  { header: "Espera (minutos)", type: "int", width: 15 },
  { header: "Cliente", type: "text", width: 26 },
  { header: "WhatsApp", type: "text", width: 16 },
  { header: "Serviço", type: "text", width: 24 },
  { header: "Profissional", type: "text", width: 22 },
  { header: "Situação", type: "text", width: 14 },
  { header: "Valor", type: "currency", width: 13 },
  { header: "Forma de pagamento", type: "text", width: 18 },
  { header: "ID", type: "text", width: 36 },
];

const QUEUE_STATUS_LABELS: Record<string, string> = {
  WAITING: "Aguardando",
  IN_CHAIR: "Em atendimento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export const queueSheet: SheetBuilder = {
  key: "queue",
  name: "Fila",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, QUEUE_COLUMNS);

    const items = await prisma.queueItem.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { joinedAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { joinedAt: "asc" },
      select: {
        id: true,
        joinedAt: true,
        calledAt: true,
        estimatedStartAt: true,
        completedAt: true,
        status: true,
        customerName: true,
        whatsapp: true,
        finalPrice: true,
        paymentMethod: true,
        service: { select: { name: true } },
      },
    });

    for (const item of items) {
      const waitMinutes =
        item.calledAt && item.joinedAt
          ? Math.max(0, Math.round((item.calledAt.getTime() - item.joinedAt.getTime()) / 60000))
          : null;
      addRow(sheet, QUEUE_COLUMNS, [
        item.joinedAt,
        item.calledAt,
        item.estimatedStartAt,
        item.completedAt,
        waitMinutes,
        ctx.options.anonymize ? anonymizeName(item.customerName) : item.customerName,
        ctx.options.anonymize ? anonymizePhone(item.whatsapp) : item.whatsapp,
        item.service?.name ?? "",
        "",
        QUEUE_STATUS_LABELS[item.status] ?? item.status,
        item.finalPrice,
        item.paymentMethod,
        item.id,
      ]);
    }
  },
};

/** ── Lista de espera ──────────────────────────────────────────────────────── */

const WAITLIST_COLUMNS: ColumnSpec[] = [
  { header: "Entrada", type: "datetime", width: 18 },
  { header: "Cliente", type: "text", width: 26 },
  { header: "WhatsApp", type: "text", width: 16 },
  { header: "Serviço", type: "text", width: 24 },
  { header: "Profissional preferido", type: "text", width: 22 },
  { header: "Data inicial", type: "date", width: 13 },
  { header: "Data final", type: "date", width: 13 },
  { header: "Preferências de horário", type: "text", width: 22 },
  { header: "Flexibilidade (minutos)", type: "int", width: 18 },
  { header: "Prioridade", type: "int", width: 11 },
  { header: "Origem", type: "text", width: 12 },
  { header: "Situação", type: "text", width: 14 },
  { header: "Ofertas", type: "text", width: 26 },
  { header: "ID", type: "text", width: 36 },
];

const WAITLIST_STATUS_LABELS: Record<string, string> = {
  WAITING: "Aguardando",
  OFFERED: "Ofertado",
  ACCEPTED: "Aceito",
  DECLINED: "Recusado",
  EXPIRED: "Expirado",
  BOOKED: "Agendado",
  CANCELED: "Cancelado",
};

export const waitlistSheet: SheetBuilder = {
  key: "waitlist",
  name: "Lista de espera",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, WAITLIST_COLUMNS);

    const entries = await prisma.appointmentWaitlistEntry.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { createdAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        customerName: true,
        whatsapp: true,
        dateFrom: true,
        dateTo: true,
        preferredPeriods: true,
        flexibilityMinutes: true,
        priority: true,
        origin: true,
        status: true,
        createdAt: true,
        service: { select: { name: true } },
        preferredStaff: { select: { name: true } },
        offers: {
          orderBy: { offeredDate: "asc" },
          select: { offeredDate: true, offeredTime: true, response: true, staff: { select: { name: true } } },
        },
      },
    });

    for (const entry of entries) {
      const offers = entry.offers
        .map((offer) => {
          const date = offer.offeredDate.toLocaleDateString("pt-BR", { timeZone: "UTC" });
          return `${date} ${offer.offeredTime}${offer.staff?.name ? ` (${offer.staff.name})` : ""}${offer.response ? ` — ${offer.response}` : ""}`;
        })
        .join("; ");
      addRow(sheet, WAITLIST_COLUMNS, [
        entry.createdAt,
        ctx.options.anonymize ? anonymizeName(entry.customerName) : entry.customerName,
        ctx.options.anonymize ? anonymizePhone(entry.whatsapp) : entry.whatsapp,
        entry.service?.name ?? "",
        entry.preferredStaff?.name ?? "",
        entry.dateFrom,
        entry.dateTo,
        entry.preferredPeriods.join(", "),
        entry.flexibilityMinutes,
        entry.priority,
        entry.origin,
        WAITLIST_STATUS_LABELS[entry.status] ?? entry.status,
        offers,
        entry.id,
      ]);
    }
  },
};

/** ── Avaliações ───────────────────────────────────────────────────────────── */

const REVIEW_COLUMNS: ColumnSpec[] = [
  { header: "Data", type: "datetime", width: 18 },
  { header: "Cliente", type: "text", width: 26 },
  { header: "Profissional", type: "text", width: 22 },
  { header: "Nota", type: "int", width: 8 },
  { header: "Comentário", type: "text", width: 44 },
  { header: "Resposta do negócio", type: "text", width: 36 },
  { header: "Situação", type: "text", width: 14 },
  { header: "Denunciada em", type: "datetime", width: 18 },
  { header: "ID", type: "text", width: 36 },
];

const REVIEW_STATUS_LABELS: Record<string, string> = {
  PUBLISHED: "Publicada",
  REPORTED: "Denunciada",
  HIDDEN: "Oculta",
};

export const reviewsSheet: SheetBuilder = {
  key: "reviews",
  name: "Avaliações",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, REVIEW_COLUMNS);

    const reviews = await prisma.clientReview.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { createdAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        rating: true,
        comment: true,
        response: true,
        status: true,
        reportedAt: true,
        createdAt: true,
        client: { select: { name: true } },
        staff: { select: { name: true } },
      },
    });

    for (const review of reviews) {
      addRow(sheet, REVIEW_COLUMNS, [
        review.createdAt,
        ctx.options.anonymize ? anonymizeName(review.client?.name) : review.client?.name,
        review.staff?.name ?? "",
        review.rating,
        review.comment,
        review.response,
        REVIEW_STATUS_LABELS[review.status] ?? review.status,
        review.reportedAt,
        review.id,
      ]);
    }
  },
};

/** ── Fidelidade ───────────────────────────────────────────────────────────── */

const LOYALTY_COLUMNS: ColumnSpec[] = [
  { header: "Cliente", type: "text", width: 28 },
  { header: "Total de visitas", type: "int", width: 15 },
  { header: "Recompensas", type: "int", width: 13 },
  { header: "Desde", type: "date", width: 13 },
  { header: "Lançamentos", type: "text", width: 40 },
  { header: "ID", type: "text", width: 36 },
];

export const loyaltySheet: SheetBuilder = {
  key: "loyalty",
  name: "Fidelidade",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, LOYALTY_COLUMNS);

    const accounts = await prisma.loyaltyAccount.findMany({
      where: { barbershopId: ctx.shop.id },
      orderBy: { totalVisits: "desc" },
      select: {
        id: true,
        totalVisits: true,
        rewardCount: true,
        createdAt: true,
        client: { select: { name: true } },
        entries: {
          orderBy: { createdAt: "asc" },
          select: { type: true, description: true, createdAt: true },
        },
      },
    });

    for (const account of accounts) {
      const entries = account.entries
        .map((entry) => `${entry.createdAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })} — ${entry.description} (${entry.type})`)
        .join("; ");
      addRow(sheet, LOYALTY_COLUMNS, [
        ctx.options.anonymize ? anonymizeName(account.client?.name) : account.client?.name,
        account.totalVisits,
        account.rewardCount,
        account.createdAt,
        entries,
        account.id,
      ]);
    }
  },
};

/** ── Indicações ───────────────────────────────────────────────────────────── */

const REFERRAL_COLUMNS: ColumnSpec[] = [
  { header: "Data", type: "date", width: 12 },
  { header: "Código", type: "text", width: 14 },
  { header: "Quem indicou", type: "text", width: 26 },
  { header: "Situação", type: "text", width: 16 },
  { header: "Dias de bônus", type: "int", width: 13 },
  { header: "Qualificado em", type: "date", width: 14 },
  { header: "Resgatado em", type: "date", width: 14 },
  { header: "ID", type: "text", width: 36 },
];

const REFERRAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  QUALIFIED: "Qualificada",
  REWARDED: "Resgatada",
  REJECTED: "Recusada",
  EXPIRED: "Expirada",
};

export const referralsSheet: SheetBuilder = {
  key: "referrals",
  name: "Indicações",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, REFERRAL_COLUMNS);

    const referrals = await prisma.referral.findMany({
      where: {
        referrerBarbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { createdAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true,
        rewardDays: true,
        qualifiedAt: true,
        rewardedAt: true,
        createdAt: true,
        referralCode: { select: { code: true, ownerUser: { select: { name: true } } } },
      },
    });

    for (const referral of referrals) {
      addRow(sheet, REFERRAL_COLUMNS, [
        referral.createdAt,
        referral.referralCode?.code ?? "",
        referral.referralCode?.ownerUser?.name ?? "",
        REFERRAL_STATUS_LABELS[referral.status] ?? referral.status,
        referral.rewardDays,
        referral.qualifiedAt,
        referral.rewardedAt,
        referral.id,
      ]);
    }
  },
};

/** ── Vouchers ─────────────────────────────────────────────────────────────── */

const VOUCHER_COLUMNS: ColumnSpec[] = [
  { header: "Código", type: "text", width: 16 },
  { header: "Descrição", type: "text", width: 34 },
  { header: "Tipo", type: "text", width: 16 },
  { header: "Valor", type: "currency", width: 14 },
  { header: "Compra mínima", type: "currency", width: 15 },
  { header: "Máximo de usos", type: "int", width: 15 },
  { header: "Usos", type: "int", width: 10 },
  { header: "Limite por cliente", type: "int", width: 16 },
  { header: "Válido de", type: "date", width: 13 },
  { header: "Válido até", type: "date", width: 13 },
  { header: "Ativo", type: "bool", width: 9 },
  { header: "ID", type: "text", width: 36 },
];

const VOUCHER_TYPE_LABELS: Record<string, string> = {
  PERCENT: "Percentual",
  FIXED: "Valor fixo",
  FREE_SERVICE: "Serviço grátis",
  BUY_X_GET_Y: "Leve X, pague Y",
};

export const vouchersSheet: SheetBuilder = {
  key: "vouchers",
  name: "Vouchers",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, VOUCHER_COLUMNS);

    const vouchers = await prisma.voucher.findMany({
      where: { barbershopId: ctx.shop.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        description: true,
        type: true,
        value: true,
        minPurchase: true,
        maxUses: true,
        usedCount: true,
        perClientLimit: true,
        startAt: true,
        endAt: true,
        isActive: true,
      },
    });

    for (const voucher of vouchers) {
      addRow(sheet, VOUCHER_COLUMNS, [
        voucher.code,
        voucher.description,
        VOUCHER_TYPE_LABELS[voucher.type] ?? voucher.type,
        voucher.value,
        voucher.minPurchase,
        voucher.maxUses,
        voucher.usedCount,
        voucher.perClientLimit,
        voucher.startAt,
        voucher.endAt,
        voucher.isActive,
        voucher.id,
      ]);
    }
  },
};

/** ── Posts e galeria (metadados, sem imagens) ─────────────────────────────── */

const POST_COLUMNS: ColumnSpec[] = [
  { header: "Título", type: "text", width: 32 },
  { header: "Tipo", type: "text", width: 16 },
  { header: "Situação", type: "text", width: 14 },
  { header: "Publicado em", type: "datetime", width: 18 },
  { header: "Agendado para", type: "datetime", width: 18 },
  { header: "Curtidas", type: "int", width: 10 },
  { header: "Fotos na galeria", type: "int", width: 16 },
  { header: "Autor", type: "text", width: 24 },
  { header: "ID", type: "text", width: 36 },
];

const FEED_TYPE_LABELS: Record<string, string> = {
  HAIRCUT: "Corte",
  BEARD: "Barba",
  ANNOUNCEMENT: "Aviso",
};

const POST_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Rascunho",
  SCHEDULED: "Agendado",
  PUBLISHED: "Publicado",
};

export const postsSheet: SheetBuilder = {
  key: "posts",
  name: "Posts e galeria",
  async build(ctx: SheetContext, sheet: SheetTarget) {
    setupSheet(sheet, POST_COLUMNS);

    const posts = await prisma.feedPost.findMany({
      where: {
        barbershopId: ctx.shop.id,
        ...(ctx.period.from && ctx.period.to
          ? { createdAt: { gte: ctx.period.from, lte: ctx.period.to } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        publishedAt: true,
        scheduledFor: true,
        likes: true,
        createdAt: true,
        author: { select: { name: true } },
        primaryMediaId: true,
        secondaryMediaId: true,
        imageUrl: true,
      },
    });

    for (const post of posts) {
      // Contagem de fotos da galeria (só metadados — as imagens não saem).
      const photos =
        (post.primaryMediaId ? 1 : 0) + (post.secondaryMediaId ? 1 : 0) + (post.imageUrl ? 1 : 0);
      addRow(sheet, POST_COLUMNS, [
        post.title,
        FEED_TYPE_LABELS[post.type] ?? post.type,
        POST_STATUS_LABELS[post.status] ?? post.status,
        post.publishedAt,
        post.scheduledFor,
        post.likes,
        photos,
        post.author?.name ?? "",
        post.id,
      ]);
    }
  },
};
