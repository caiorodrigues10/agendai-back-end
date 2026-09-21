import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import crypto from "node:crypto";

// ─── Categorias canônicas de e-mail ───────────────────────────

export const EMAIL_CATEGORY = {
  SECURITY: "ESSENTIAL",
  FINANCIAL: "ESSENTIAL",
  URGENT: "OPERATION",
  DAILY_DIGEST: "OPERATION",
  STOCK: "OPERATION",
  PERFORMANCE: "OPERATION",
  MARKETING: "MARKETING",
} as const;

export type EmailCategoryValue =
  (typeof EMAIL_CATEGORY)[keyof typeof EMAIL_CATEGORY];

const VALID_CATEGORIES = new Set<string>(Object.values(EMAIL_CATEGORY));

/**
 * Categoria padrão de cada template — usada quando o usuário não tem
 * preferência explícita salva para aquele parceiro (salão + categoria).
 */
export function categoryForTemplate(templateKey: string): EmailCategoryValue {
  if ([
    "verify_email",
    "welcome",
    "welcome_staff",
    "forgot_password",
    "password_changed",
    "payment_approved",
    "payment_failed",
    "subscription_renewal_failed",
    "subscription_canceled",
    "subscription_trial_ended",
  ].includes(templateKey)) return "ESSENTIAL";

  if (
    [
      "daily_digest",
      "appointment_urgent_cancelled",
      "appointment_urgent_rescheduled",
      "subscription_trial_ending",
      "subscription_renewed",
    ].includes(templateKey)
  ) {
    return "OPERATION";
  }

  // referral, CRM, qualquer outro → marketing
  return "MARKETING";
}

// ─── Serviço principal de preferências ──────────────────────────

export interface EmailPreference {
  barbershopId: string;
  userId: string;
  category: EmailCategoryValue;
  enabled: boolean;
}

export interface BarbershopEmailSettings {
  barbershopId: string;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string; // HH:mm
  timezone: string; // ex.: "America/Sao_Paulo"
  urgentAppointmentWindowHours: number;
  lowStockEnabled: boolean;
  performanceSummaryFrequency: "weekly" | "monthly" | "off";
}

/**
 * Verifica se um usuário específico deve receber um e-mail da categoria.
 *
 * Regras:
 * 1. Se o usuário não existir no salão → false (isolamento).
 * 2. Se não houver registro explícito → usa o default da categoria.
 * 3. Categoria ESSENTIAL sempre é enviada — não pode ser desativada.
 */
export async function canReceiveEmail(
  userId: string,
  barbershopId: string,
  category: EmailCategoryValue
): Promise<boolean> {
  if (category === "ESSENTIAL") return true;

  // Isolamento: garante que o usuário realmente pertence ao salão
  const user = await prisma.user.findFirst({
    where: { id: userId, barbershopId },
    select: { id: true },
  });
  if (!user) return false;

  const preference = await prisma.salonEmailPreference.findUnique({
    where: {
      user_shop_category: { userId, barbershopId, category },
    },
    select: { enabled: true },
  });

  // Sem registro → padrão por defeito da categoria.
  return preference?.enabled ?? categoryDefaultEnabled(category);
}

/**
 * Busca todos os destinatários de uma categoria em um salão.
 * Retorna apenas usuários ATIVOS e pertencentes ao salão.
 *
 * "Para quem" deste módulo sempre é alguém com papel de salão —
 * nunca cliente final; essa função garante isso filtrando apenas role = OWNER/EMPLOYEE.
 */
export async function getEmailRecipients(
  barbershopId: string,
  category: EmailCategoryValue
): Promise<Array<{ userId: string; email: string; name: string }>> {
  if (!VALID_CATEGORIES.has(category)) return [];

  const users = await prisma.user.findMany({
    where: {
      barbershopId,
      active: true,
      deletedAt: null,
      role: { in: ["OWNER", "EMPLOYEE"] },
    },
    select: { id: true, email: true, name: true },
  });

  const preferences = await prisma.salonEmailPreference.findMany({
    where: { barbershopId, category, enabled: false },
    select: { userId: true },
  });
  const disabledUserIds = new Set(preferences.map((p: { userId: string }) => p.userId));

  return users
    .filter((u: { id: string; email: string; name: string }) => !disabledUserIds.has(u.id))
    .map((u: { id: string; email: string; name: string }) => ({ userId: u.id, email: u.email, name: u.name }));
}

/** Atualiza (liga/desliga) a preferência de um usuário em um salão. */
export async function setEmailPreference(
  userId: string,
  barbershopId: string,
  category: EmailCategoryValue,
  enabled: boolean
): Promise<void> {
  if (category === "ESSENTIAL") {
    throw new AppError("E-mails de segurança são obrigatórios", 400);
  }

  // Isolamento: confirma que o usuário pertence ao salão antes de persistir.
  const user = await prisma.user.findFirst({
    where: { id: userId, barbershopId },
    select: { id: true },
  });
  if (!user) throw new AppError("Usuário não pertence a este salão", 404);

  await prisma.salonEmailPreference.upsert({
    where: { user_shop_category: { userId, barbershopId, category } },
    create: { barbershopId, userId, category, enabled },
    update: { enabled },
  });
}

/** Configurações do salão (digest, timezone, etc.) */
export async function getBarbershopEmailSettings(
  barbershopId: string
): Promise<BarbershopEmailSettings> {
  const settings = await prisma.barbershopEmailSettings.findUnique({
    where: { barbershopId },
  });
  return (
    settings ?? {
      barbershopId,
      dailyDigestEnabled: true,
      dailyDigestTime: "18:00",
      timezone: "America/Sao_Paulo",
      urgentAppointmentWindowHours: 24,
      lowStockEnabled: false,
      performanceSummaryFrequency: "weekly",
    }
  );
}

export async function updateBarbershopEmailSettings(
  barbershopId: string,
  input: Partial<Omit<BarbershopEmailSettings, "barbershopId">>
): Promise<BarbershopEmailSettings> {
  if (input.dailyDigestTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.dailyDigestTime)) {
    throw new AppError("Formato de horário inválido (use HH:mm)", 400);
  }
  return prisma.barbershopEmailSettings.upsert({
    where: { barbershopId },
    create: { barbershopId, ...input },
    update: input,
  });
}

// ─── Token de descadastro seguro ─────────────────────────────────

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

export interface EmailUnsubscribePayload {
  userId: string;
  barbershopId: string;
  category: string;
  purpose: "email-unsubscribe";
  iat: number;
  exp: number;
  jti: string;
}

function getUnsubscribeSecret(): string {
  const s = process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (!s) throw new Error("EMAIL_UNSUBSCRIBE_SECRET não configurada");
  return s;
}

/** Assina um payload JWT minimalista com HMAC-SHA256. */
export function signUnsubscribeToken(payload: Omit<EmailUnsubscribePayload, "jti">): string {
  const body = {
    ...payload,
    jti: crypto.randomBytes(8).toString("hex"),
  };
  const json = JSON.stringify(body);
  const secret = getUnsubscribeSecret();
  return crypto
    .createHmac("sha256", secret)
    .update(json)
    .digest("base64url") + "." + Buffer.from(json).toString("base64url");
}

/** Valida e devolve o payload, ou lança AppError. */
export function verifyUnsubscribeToken(token: string): EmailUnsubscribePayload {
  const secret = getUnsubscribeSecret();
  const [sig, body] = token.split(".");
  if (!sig || !body) {
    throw new AppError("Token de descadastro inválido", 400);
  }

  let payload: EmailUnsubscribePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64").toString("utf-8"));
  } catch {
    throw new AppError("Token de descadastro inválido", 400);
  }

  if (payload.purpose !== "email-unsubscribe") {
    throw new AppError("Token de descadastro inválido", 400);
  }
  if (payload.exp < Date.now()) {
    throw new AppError("Token expirado", 410);
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new AppError("Token de descadastro inválido", 400);
  }

  return payload;
}

/** Razão amigável da categoria — usada na tela de descadastro. */
export function emailCategoryLabel(category: EmailCategoryValue): string {
  switch (category) {
    case "ESSENTIAL": return "Segurança da conta";
    case "OPERATION": return "Resumos e alertas operacionais";
    case "MARKETING": return "Novidades e conteúdo";
    default: return category;
  }
}

function categoryDefaultEnabled(category: EmailCategoryValue): boolean {
  return category !== "MARKETING";
}
