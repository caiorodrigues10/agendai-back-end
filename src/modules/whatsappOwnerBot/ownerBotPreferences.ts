import type { OwnerBotRepository } from "./ownerBotRepository";

/**
 * Preferências do assistente por estabelecimento.
 *
 * Ficam no banco (não no Redis) porque precisam sobreviver a reinícios e
 * ser editadas tanto pelo WhatsApp quanto pela seção do front.
 */

export type OwnerBotTone = "FRIENDLY" | "FORMAL";

export const OWNER_BOT_ALERT_TYPES = [
  "CLIENT_LATE",
  "FREE_SLOT",
  "CANCELLATION",
  "LOW_STOCK",
  "GOAL_RISK",
  "PAYMENT_DUE",
  "INSTANCE_OFFLINE",
] as const;

export type OwnerBotAlertType = (typeof OWNER_BOT_ALERT_TYPES)[number];

export type OwnerBotPreferences = {
  enabled: boolean;
  blocked: boolean;
  briefingEnabled: boolean;
  briefingTime: string;
  summaryEnabled: boolean;
  summaryTime: string;
  alertsEnabled: boolean;
  alertTypes: OwnerBotAlertType[];
  tone: OwnerBotTone;
  language: string;
};

export const OWNER_BOT_DEFAULT_PREFERENCES: OwnerBotPreferences = {
  enabled: true,
  blocked: false,
  briefingEnabled: false,
  briefingTime: "07:30",
  summaryEnabled: false,
  summaryTime: "21:00",
  alertsEnabled: true,
  alertTypes: [],
  tone: "FRIENDLY",
  language: "pt-BR",
};

/** Lê as preferências; salão sem registro usa o padrão (assistente ligado). */
export async function getOwnerBotPreferences(
  repo: OwnerBotRepository,
  barbershopId: string
): Promise<OwnerBotPreferences> {
  const row = await repo.getPreferences(barbershopId);
  if (!row) return { ...OWNER_BOT_DEFAULT_PREFERENCES };
  return {
    enabled: row.enabled,
    blocked: row.blocked,
    briefingEnabled: row.briefingEnabled,
    briefingTime: row.briefingTime,
    summaryEnabled: row.summaryEnabled,
    summaryTime: row.summaryTime,
    alertsEnabled: row.alertsEnabled,
    alertTypes: row.alertTypes.filter((type): type is OwnerBotAlertType =>
      (OWNER_BOT_ALERT_TYPES as readonly string[]).includes(type)
    ),
    tone: row.tone === "FORMAL" ? "FORMAL" : "FRIENDLY",
    language: row.language,
  };
}

/** Atualiza as preferências (upsert). */
export async function updateOwnerBotPreferences(
  repo: OwnerBotRepository,
  barbershopId: string,
  patch: Partial<OwnerBotPreferences> & { blockedAt?: Date | null }
): Promise<OwnerBotPreferences> {
  await repo.upsertPreferences(barbershopId, patch);
  return getOwnerBotPreferences(repo, barbershopId);
}

/** Rótulos dos tipos de alerta (menu "configurar assistente"). */
export const OWNER_BOT_ALERT_LABELS: Record<OwnerBotAlertType, string> = {
  CLIENT_LATE: "cliente atrasado",
  FREE_SLOT: "horário vago nas próximas 2h",
  CANCELLATION: "cancelamento de última hora",
  LOW_STOCK: "estoque baixo",
  GOAL_RISK: "meta em risco",
  PAYMENT_DUE: "pagamento ou assinatura pendente",
  INSTANCE_OFFLINE: "WhatsApp do salão desconectado",
};
