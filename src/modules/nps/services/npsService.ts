import { prisma, type AppTx } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { createAuditLog } from "@/shared/services/auditLogService";
import {
  hashNotificationDestination,
  maskDestination,
  normalizeDestination,
} from "@/modules/notifications/services/notificationSecurity";

/** Tipo de notificação registrado no registry (preferências do salão). */
export const NPS_SURVEY_TYPE = "NPS_SURVEY";
/** Janela do agregado e cooldown máximo de envio por respondente. */
export const NPS_WINDOW_DAYS = 90;
/** Abaixo disso o agregado é marcado como "sem dados suficientes". */
export const NPS_MIN_RESPONSES = 10;
const NPS_TRIAL_MIN_DAYS = 14;
const SURVEY_TTL_DAYS = 15;
const DAY_MS = 86_400_000;

export type NpsSummary = {
  windowDays: number;
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  score: number | null;
  insufficient: boolean;
};

export type NpsSkipped = {
  preferenceDisabled: number;
  suppressed: number;
  cooldown: number;
  active: number;
  noContact: number;
};

export type CreateSurveysResult = {
  created: number;
  skipped: NpsSkipped;
  surveys: Array<{ id: string; destinationMasked: string; expiresAt: string }>;
};

export type NpsSurveyListRow = {
  id: string;
  barbershopId: string;
  destinationMasked: string;
  channel: string;
  status: string;
  sentAt: Date;
  expiresAt: Date;
  answeredAt: Date | null;
  score: number | null;
};

type ShopSubscription = { status: string; startDate: Date } | null;

type EligibilityInput = { active: boolean; subscription: ShopSubscription };
export type EligibilityReason =
  | "SHOP_INACTIVE"
  | "NO_SUBSCRIPTION"
  | "TRIAL_TOO_YOUNG"
  | "SUBSCRIPTION_NOT_ELIGIBLE";

/**
 * Elegibilidade de pesquisa NPS por salão: apenas salões com assinatura
 * ACTIVE ou TRIALING há pelo menos 14 dias.
 */
export function isShopEligible(input: EligibilityInput, now = new Date()): {
  eligible: boolean;
  reason?: EligibilityReason;
} {
  if (!input.active) return { eligible: false, reason: "SHOP_INACTIVE" };
  const sub = input.subscription;
  if (!sub) return { eligible: false, reason: "NO_SUBSCRIPTION" };
  if (sub.status === "ACTIVE") return { eligible: true };
  if (sub.status === "TRIALING") {
    const trialStartedAt = sub.startDate.getTime();
    return trialStartedAt <= now.getTime() - NPS_TRIAL_MIN_DAYS * DAY_MS
      ? { eligible: true }
      : { eligible: false, reason: "TRIAL_TOO_YOUNG" };
  }
  return { eligible: false, reason: "SUBSCRIPTION_NOT_ELIGIBLE" };
}

export async function assertShopEligible(barbershopId: string): Promise<{ id: string; name: string }> {
  const shop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: {
      id: true,
      name: true,
      active: true,
      subscriptions: { select: { status: true, startDate: true }, take: 1 },
    },
  });
  if (!shop) {
    throw new AppError("Salão não encontrado.", 404, undefined, "SHOP_NOT_FOUND");
  }
  const check = isShopEligible({
    active: shop.active,
    subscription: shop.subscriptions[0] ?? null,
  });
  if (!check.eligible) {
    throw new AppError(
      "Salão não elegível para pesquisa NPS (assinatura ACTIVE ou TRIALING há pelo menos 14 dias).",
      400,
      undefined,
      check.reason,
    );
  }
  return shop;
}

type CandidateClient = { id: string; whatsapp: string; normalizedWhatsapp: string | null };

/**
 * Cria pesquisas NPS para clientes do salão aplicando as regras de envio:
 * - salão elegível (ACTIVE ou TRIALING ≥14 dias);
 * - preferência `NPS_SURVEY` do salão habilitada (canal WHATSAPP);
 * - destino sem supressão ativa (escopo global ou do salão);
 * - no máximo 1 pesquisa ativa por respondente e 1 resposta a cada 90 dias;
 * - apenas clientes com opt-in de marketing e WhatsApp conhecido (LGPD).
 *
 * Nenhum contato cru é persistido: guarda-se hash (`respondentKey`) e máscara.
 */
export async function createSurveysForShop(params: {
  barbershopId: string;
  limit: number;
  requestedBy: string;
  ipAddress?: string;
}): Promise<CreateSurveysResult> {
  const shop = await assertShopEligible(params.barbershopId);
  const skipped: NpsSkipped = {
    preferenceDisabled: 0,
    suppressed: 0,
    cooldown: 0,
    active: 0,
    noContact: 0,
  };

  const candidates: CandidateClient[] = await prisma.salonClient.findMany({
    where: { barbershopId: shop.id, marketingOptIn: true },
    orderBy: { updatedAt: "desc" },
    take: Math.min(params.limit * 3, 600),
    select: { id: true, whatsapp: true, normalizedWhatsapp: true },
  });

  const preference = await prisma.notificationPreference.findUnique({
    where: {
      barbershopId_channel_type: {
        barbershopId: shop.id,
        channel: "WHATSAPP",
        type: NPS_SURVEY_TYPE,
      },
    },
    select: { enabled: true },
  });
  if (preference && !preference.enabled) {
    skipped.preferenceDisabled = candidates.length;
    return { created: 0, skipped, surveys: [] };
  }

  const now = new Date();
  const cooldownSince = new Date(now.getTime() - NPS_WINDOW_DAYS * DAY_MS);
  const expiresAt = new Date(now.getTime() + SURVEY_TTL_DAYS * DAY_MS);
  const surveys: CreateSurveysResult["surveys"] = [];
  let remaining = params.limit;

  for (const client of candidates) {
    if (remaining <= 0) break;
    const raw = client.normalizedWhatsapp?.trim() || client.whatsapp?.trim();
    if (!raw) {
      skipped.noContact += 1;
      continue;
    }
    const normalized = normalizeDestination("WHATSAPP", raw);
    if (!normalized) {
      skipped.noContact += 1;
      continue;
    }
    const respondentKey = hashNotificationDestination(normalized);

    const suppression = await prisma.notificationSuppression.findFirst({
      where: {
        scopeKey: { in: ["global", shop.id] },
        channel: "WHATSAPP",
        destinationHash: respondentKey,
        active: true,
      },
      select: { id: true },
    });
    if (suppression) {
      skipped.suppressed += 1;
      continue;
    }

    const active = await prisma.npsSurvey.findFirst({
      where: {
        barbershopId: shop.id,
        respondentKey,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (active) {
      skipped.active += 1;
      continue;
    }

    const answered = await prisma.npsSurvey.findFirst({
      where: {
        barbershopId: shop.id,
        respondentKey,
        answeredAt: { gte: cooldownSince },
      },
      select: { id: true },
    });
    if (answered) {
      skipped.cooldown += 1;
      continue;
    }

    const survey = await prisma.npsSurvey.create({
      data: {
        barbershopId: shop.id,
        clientId: client.id,
        respondentKey,
        destinationMasked: maskDestination("WHATSAPP", normalized),
        channel: "WHATSAPP",
        status: "PENDING",
        sentAt: now,
        expiresAt,
      },
      select: { id: true, destinationMasked: true, expiresAt: true },
    });
    surveys.push({
      id: survey.id,
      destinationMasked: survey.destinationMasked,
      expiresAt: survey.expiresAt.toISOString(),
    });
    remaining -= 1;
  }

  if (surveys.length > 0) {
    await createAuditLog({
      userId: params.requestedBy,
      action: "NPS_SURVEY_SEND",
      resource: "NpsSurvey",
      resourceId: shop.id,
      barbershopId: shop.id,
      ipAddress: params.ipAddress,
      details: JSON.stringify({ created: surveys.length, skipped }),
    });
  }

  return { created: surveys.length, skipped, surveys };
}

export type NpsAnswerResult = {
  surveyId: string;
  barbershopId: string;
  score: number;
  comment: string | null;
};

/**
 * Registra a resposta pública da pesquisa. Votação: inteiro 0–10,
 * consentimento LGPD obrigatório e uma resposta por pesquisa.
 */
export async function recordResponse(
  surveyId: string,
  input: { score: number; comment?: string; lgpdAccepted: boolean },
): Promise<NpsAnswerResult> {
  const survey = await prisma.npsSurvey.findUnique({
    where: { id: surveyId },
    select: { id: true, barbershopId: true, status: true, expiresAt: true },
  });
  if (!survey) {
    throw new AppError("Pesquisa NPS não encontrada.", 404, undefined, "NPS_SURVEY_NOT_FOUND");
  }
  if (survey.status === "ANSWERED") {
    throw new AppError("Pesquisa NPS já respondida.", 409, undefined, "NPS_ALREADY_ANSWERED");
  }
  const now = new Date();
  if (survey.status === "EXPIRED" || survey.expiresAt <= now) {
    await prisma.npsSurvey.updateMany({
      where: { id: survey.id, status: "PENDING" },
      data: { status: "EXPIRED" },
    });
    throw new AppError("Pesquisa NPS expirada.", 409, undefined, "NPS_SURVEY_EXPIRED");
  }
  if (!input.lgpdAccepted) {
    throw new AppError(
      "Consentimento LGPD obrigatório para registrar a resposta.",
      400,
      undefined,
      "LGPD_CONSENT_REQUIRED",
    );
  }
  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 10) {
    throw new AppError("A pontuação deve ser um inteiro de 0 a 10.", 400, undefined, "NPS_SCORE_INVALID");
  }
  const comment = input.comment?.trim() ? input.comment.trim().slice(0, 500) : null;

  const response = await prisma
    .$transaction(async (tx: AppTx) => {
      const created = await tx.npsResponse.create({
        data: {
          surveyId: survey.id,
          barbershopId: survey.barbershopId,
          score: input.score,
          comment,
        },
        select: { id: true, score: true, comment: true },
      });
      await tx.npsSurvey.update({
        where: { id: survey.id },
        data: { status: "ANSWERED", answeredAt: now },
      });
      return created;
    })
    .catch((error: unknown) => {
      if ((error as { code?: string })?.code === "P2002") {
        throw new AppError("Pesquisa NPS já respondida.", 409, undefined, "NPS_ALREADY_ANSWERED");
      }
      throw error;
    });

  return {
    surveyId: survey.id,
    barbershopId: survey.barbershopId,
    score: response.score,
    comment: response.comment,
  };
}

type SurveyPublicInfo = {
  id: string;
  status: string;
  shopName: string;
  destinationMasked: string;
  expiresAt: Date;
};

/** Dados públicos da pesquisa para a página de resposta (sem PII). */
export async function getPublicSurvey(surveyId: string): Promise<SurveyPublicInfo> {
  const survey = await prisma.npsSurvey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      destinationMasked: true,
      barbershop: { select: { name: true } },
    },
  });
  if (!survey) {
    throw new AppError("Pesquisa NPS não encontrada.", 404, undefined, "NPS_SURVEY_NOT_FOUND");
  }
  const expired = survey.expiresAt <= new Date();
  return {
    id: survey.id,
    status: expired && survey.status === "PENDING" ? "EXPIRED" : survey.status,
    shopName: survey.barbershop.name,
    destinationMasked: survey.destinationMasked,
    expiresAt: survey.expiresAt,
  };
}

/**
 * Agregado NPS real (janela de 90 dias): promotores 9–10, passivos 7–8,
 * detratores 0–6. `insufficient` quando há menos de 10 respostas.
 */
export async function npsSummary(barbershopId?: string): Promise<NpsSummary> {
  const since = new Date(Date.now() - NPS_WINDOW_DAYS * DAY_MS);
  const rows: Array<{ score: number; _count: { _all: number } }> =
    await prisma.npsResponse.groupBy({
      by: ["score"],
      where: {
        createdAt: { gte: since },
        ...(barbershopId ? { barbershopId } : {}),
      },
      _count: { _all: true },
    });

  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  rows.forEach((row: { score: number; _count: { _all: number } }) => {
    const count = row._count._all;
    if (row.score >= 9) promoters += count;
    else if (row.score >= 7) passives += count;
    else detractors += count;
  });
  const responses = promoters + passives + detractors;
  const score =
    responses > 0 ? Math.round(((promoters - detractors) / responses) * 100) : null;

  return {
    windowDays: NPS_WINDOW_DAYS,
    responses,
    promoters,
    passives,
    detractors,
    score,
    insufficient: responses < NPS_MIN_RESPONSES,
  };
}

/** Listagem paginada de pesquisas (contato apenas mascarado). */
export async function listSurveys(params: {
  barbershopId?: string;
  status?: "PENDING" | "ANSWERED" | "EXPIRED";
  page: number;
  pageSize: number;
}): Promise<{ total: number; page: number; pageSize: number; items: NpsSurveyListRow[] }> {
  const where = {
    ...(params.barbershopId ? { barbershopId: params.barbershopId } : {}),
    ...(params.status ? { status: params.status } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.npsSurvey.count({ where }),
    prisma.npsSurvey.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        barbershopId: true,
        destinationMasked: true,
        channel: true,
        status: true,
        sentAt: true,
        expiresAt: true,
        answeredAt: true,
        response: { select: { score: true } },
      },
    }),
  ]);

  const items: NpsSurveyListRow[] = rows.map(
    (row: {
      id: string;
      barbershopId: string;
      destinationMasked: string;
      channel: string;
      status: string;
      sentAt: Date;
      expiresAt: Date;
      answeredAt: Date | null;
      response: { score: number } | null;
    }) => ({
      id: row.id,
      barbershopId: row.barbershopId,
      destinationMasked: row.destinationMasked,
      channel: row.channel,
      status: row.status,
      sentAt: row.sentAt,
      expiresAt: row.expiresAt,
      answeredAt: row.answeredAt,
      score: row.response?.score ?? null,
    }),
  );

  return { total, page: params.page, pageSize: params.pageSize, items };
}
