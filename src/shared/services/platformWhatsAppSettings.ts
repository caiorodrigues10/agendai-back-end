import { prisma } from "@/libs/prismaClient";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("platform-whatsapp-settings");

export type PlatformWhatsAppSettings = {
  aiGloballyEnabled: boolean;
  ownerBotGloballyEnabled: boolean;
  outboundPaused: boolean;
  reason: string | null;
  updatedBy: string | null;
  updatedAt: Date;
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
    if (!(prisma as any).platformWhatsAppSetting) {
      return {
        aiGloballyEnabled: true,
        ownerBotGloballyEnabled: true,
        outboundPaused: false,
        reason: null,
        updatedBy: null,
        updatedAt: new Date(),
      };
    }
    let row = await prisma.platformWhatsAppSetting.findUnique({ where: { id: "global" } });
    if (!row) {
      row = await prisma.platformWhatsAppSetting.create({
        data: { id: "global" },
      });
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
    logger.error({ err }, "Falha ao ler configuração global de WhatsApp — modo seguro");
    const safe: PlatformWhatsAppSettings = {
      aiGloballyEnabled: false,
      ownerBotGloballyEnabled: false,
      outboundPaused: true,
      reason: null,
      updatedBy: null,
      updatedAt: new Date(),
    };
    return safe;
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
      aiGloballyEnabled: input.aiGloballyEnabled ?? true,
      ownerBotGloballyEnabled: input.ownerBotGloballyEnabled ?? true,
      outboundPaused: input.outboundPaused ?? false,
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
