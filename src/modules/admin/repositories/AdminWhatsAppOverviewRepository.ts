import { prisma } from "@/libs/prismaClient";

export interface AdminWhatsAppOverviewCounts {
  aiConversationsTotal: number;
  aiMessages24h: number;
  ownerBotActions24h: number;
  shopsWithAiEnabled: number;
  shopsWithOwnerBotEnabled: number;
}

export interface IAdminWhatsAppOverviewRepository {
  countsSince(since: Date): Promise<AdminWhatsAppOverviewCounts>;
}

export class AdminWhatsAppOverviewRepository implements IAdminWhatsAppOverviewRepository {
  async countsSince(since: Date): Promise<AdminWhatsAppOverviewCounts> {
    const [aiConversationsTotal, aiMessages24h, ownerBotActions24h, shopsWithAiEnabled, shopsWithOwnerBotEnabled] =
      await Promise.all([
        prisma.aiConversation.count(),
        prisma.aiMessage.count({ where: { sentAt: { gte: since } } }),
        prisma.ownerBotActionLog.count({ where: { createdAt: { gte: since } } }),
        prisma.barbershop.count({ where: { whatsappAiEnabled: true } }),
        prisma.ownerBotPreference.count({ where: { enabled: true, blocked: false } }),
      ]);

    return { aiConversationsTotal, aiMessages24h, ownerBotActions24h, shopsWithAiEnabled, shopsWithOwnerBotEnabled };
  }
}
