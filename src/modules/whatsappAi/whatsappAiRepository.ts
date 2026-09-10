import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

const conversationSelect = {
  id: true,
  barbershopId: true,
  phone: true,
  normalizedPhone: true,
  status: true,
  context: true,
  startedAt: true,
  lastMessageAt: true,
  endedAt: true,
  _count: { select: { messages: true } },
} as const;

const messageSelect = {
  id: true,
  conversationId: true,
  direction: true,
  content: true,
  messageType: true,
  intent: true,
  entities: true,
  confidence: true,
  sentAt: true,
} as const;

const intentLogSelect = {
  id: true,
  barbershopId: true,
  phone: true,
  intent: true,
  entities: true,
  confidence: true,
  handledBy: true,
  resolution: true,
  loggedAt: true,
} as const;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export class WhatsAppAiRepository {
  async findOrCreateConversation(barbershopId: string, phone: string) {
    const normalized = normalizePhone(phone);
    const existing = await prisma.aiConversation.findFirst({
      where: { barbershopId, normalizedPhone: normalized, status: "ACTIVE" },
      select: conversationSelect,
    });
    if (existing) return existing;

    return prisma.aiConversation.create({
      data: {
        barbershopId,
        phone,
        normalizedPhone: normalized,
        status: "ACTIVE",
      },
      select: conversationSelect,
    });
  }

  async createMessage(data: {
    conversationId: string;
    direction: "INBOUND" | "OUTBOUND";
    content: string;
    messageType?: string;
    intent?: string;
    entities?: Record<string, unknown>;
    confidence?: number;
  }) {
    return prisma.aiMessage.create({
      data: {
        conversationId: data.conversationId,
        direction: data.direction,
        content: data.content,
        messageType: (data.messageType as any) ?? "TEXT",
        intent: data.intent ?? null,
        entities: data.entities ?? {},
        confidence: data.confidence ?? null,
      },
      select: messageSelect,
    });
  }

  async updateConversationLastMessage(conversationId: string) {
    return prisma.aiConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
  }

  async closeConversation(conversationId: string) {
    return prisma.aiConversation.update({
      where: { id: conversationId },
      data: { status: "CLOSED", endedAt: new Date() },
    });
  }

  async transferToHuman(conversationId: string) {
    return prisma.aiConversation.update({
      where: { id: conversationId },
      data: { status: "TRANSFERRED_TO_HUMAN", endedAt: new Date() },
    });
  }

  async listByBarbershop(
    barbershopId: string,
    filters?: { status?: string; page?: number; limit?: number }
  ) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      barbershopId,
      ...(filters?.status ? { status: filters.status as any } : {}),
    };

    const [conversations, total] = await Promise.all([
      prisma.aiConversation.findMany({
        where,
        select: conversationSelect,
        orderBy: { lastMessageAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.aiConversation.count({ where }),
    ]);

    return { conversations, total, page, limit };
  }

  async findById(id: string) {
    return prisma.aiConversation.findUnique({
      where: { id },
      select: conversationSelect,
    });
  }

  async getMessages(conversationId: string) {
    return prisma.aiMessage.findMany({
      where: { conversationId },
      select: messageSelect,
      orderBy: { sentAt: "asc" },
    });
  }

  async createIntentLog(data: {
    barbershopId: string;
    phone: string;
    intent: string;
    entities?: Record<string, unknown>;
    confidence: number;
    handledBy?: string;
    resolution?: string;
  }) {
    return prisma.aiIntentLog.create({
      data: {
        barbershopId: data.barbershopId,
        phone: data.phone,
        intent: data.intent,
        entities: data.entities ?? {},
        confidence: data.confidence,
        handledBy: (data.handledBy as any) ?? "AI",
        resolution: data.resolution ?? null,
      },
      select: intentLogSelect,
    });
  }

  async getIntentLogs(
    barbershopId: string,
    filters?: { intent?: string; startDate?: string; endDate?: string; page?: number; limit?: number }
  ) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { barbershopId };
    if (filters?.intent) where.intent = filters.intent;
    if (filters?.startDate || filters?.endDate) {
      where.loggedAt = {
        ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.aiIntentLog.findMany({
        where: where as any,
        select: intentLogSelect,
        orderBy: { loggedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.aiIntentLog.count({ where: where as any }),
    ]);

    return { logs, total, page, limit };
  }

  async getIntentStats(barbershopId: string) {
    const logs = await prisma.aiIntentLog.findMany({
      where: { barbershopId },
      select: { intent: true, confidence: true, handledBy: true },
    });

    const byIntent: Record<string, number> = {};
    const byHandledBy: Record<string, number> = {};
    let totalConfidence = 0;

    for (const log of logs) {
      byIntent[log.intent] = (byIntent[log.intent] || 0) + 1;
      byHandledBy[log.handledBy] = (byHandledBy[log.handledBy] || 0) + 1;
      totalConfidence += log.confidence;
    }

    return {
      total: logs.length,
      byIntent,
      byHandledBy,
      avgConfidence: logs.length > 0 ? totalConfidence / logs.length : 0,
    };
  }
}
