import { prisma } from "@/libs/prismaClient";
import { getModuleLogger } from "@/shared/utils/logger";
import { getCorrelationId } from "@/shared/utils/correlationContext";

const logger = getModuleLogger("platform-whatsapp-settings");

export type PlatformWhatsAppSettings = {
  aiGloballyEnabled: boolean;
  ownerBotGloballyEnabled: boolean;
  outboundPaused: boolean;
  reason: string | null;
  updatedBy: string | null;
  updatedAt: Date;
};

// Defaults documentados (primeira execução): IA e assistente ligados, envios ativos.
const DEFAULT_SETTINGS: PlatformWhatsAppSettings = {
  aiGloballyEnabled: true,
  ownerBotGloballyEnabled: true,
  outboundPaused: false,
  reason: null,
  updatedBy: null,
  updatedAt: new Date(),
};

// Modo seguro (falha de leitura): tudo pausado.
const SAFE_SETTINGS: PlatformWhatsAppSettings = {
  aiGloballyEnabled: false,
  ownerBotGloballyEnabled: false,
  outboundPaused: true,
  reason: null,
  updatedBy: null,
  updatedAt: new Date(),
};

const CACHE_TTL_MS = 5_000;
let cache: { value: PlatformWhatsAppSettings; expiresAt: number } | null = null;

export function invalidatePlatformWhatsAppSettingsCache() {
  cache = null;
}

export async function getPlatformWhatsAppSettings(): Promise<PlatformWhatsAppSettings> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.value;

  try {
    let row = await prisma.platformWhatsAppSetting.findUnique({ where: { id: "global" } });
    if (!row) {
      try {
        row = await prisma.platformWhatsAppSetting.create({ data: { id: "global" } });
      } catch (createErr) {
        // corrida: tenta ler de novo
        row = await prisma.platformWhatsAppSetting.findUnique({ where: { id: "global" } });
        if (!row) throw createErr;
      }
    }
    const value: PlatformWhatsAppSettings = {
      aiGloballyEnabled: row.aiGloballyEnabled,
      ownerBotGloballyEnabled: row.ownerBotGloballyEnabled,
      outboundPaused: row.outboundPaused,
      reason: row.reason,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt,
    };
    cache = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch (err) {
    logger.error({ err, correlationId: getCorrelationId() }, "Falha ao ler configuração global de WhatsApp — modo seguro (pausado)");
    return SAFE_SETTINGS;
  }
}

export async function updatePlatformWhatsAppSettings(input: {
  aiGloballyEnabled?: boolean;
  ownerBotGloballyEnabled?: boolean;
  outboundPaused?: boolean;
  reason?: string | null;
  updatedBy?: string | null;
}): Promise<PlatformWhatsAppSettings> {
  const row = await prisma.platformWhatsAppSetting.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      aiGloballyEnabled: input.aiGloballyEnabled ?? DEFAULT_SETTINGS.aiGloballyEnabled,
      ownerBotGloballyEnabled: input.ownerBotGloballyEnabled ?? DEFAULT_SETTINGS.ownerBotGloballyEnabled,
      outboundPaused: input.outboundPaused ?? DEFAULT_SETTINGS.outboundPaused,
      reason: input.reason ?? null,
      updatedBy: input.updatedBy ?? null,
    },
    update: {
      ...(input.aiGloballyEnabled !== undefined && { aiGloballyEnabled: input.aiGloballyEnabled }),
      ...(input.ownerBotGloballyEnabled !== undefined && { ownerBotGloballyEnabled: input.ownerBotGloballyEnabled }),
      ...(input.outboundPaused !== undefined && { outboundPaused: input.outboundPaused }),
      ...(input.reason !== undefined && { reason: input.reason }),
      ...(input.updatedBy !== undefined && { updatedBy: input.updatedBy }),
    },
  });
  invalidatePlatformWhatsAppSettingsCache();
  return {
    aiGloballyEnabled: row.aiGloballyEnabled,
    ownerBotGloballyEnabled: row.ownerBotGloballyEnabled,
    outboundPaused: row.outboundPaused,
    reason: row.reason,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
}
