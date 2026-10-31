import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { aiPhoneCandidates, AI_PHONE_MAX_LENGTH, canonicalAiPhone } from "./whatsappAiPhone";
import type { AiResolvedSalon, AiSalonContext } from "./whatsappAi.types";

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

const salonSummarySelect = {
  id: true,
  name: true,
  active: true,
  approvalStatus: true,
  whatsappAiEnabled: true,
} as const;

function truncatePhone(phone: string): string {
  return (phone ?? "").slice(0, AI_PHONE_MAX_LENGTH);
}

export class WhatsAppAiRepository {
  // ─── Conversas ─────────────────────────────────────────────────────────────

  /**
   * Conversa ativa do cliente no salão.
   *
   * A busca usa as variantes do telefone (com e sem DDI 55) porque o número
   * pode ter sido gravado em formatos diferentes; o valor gravado é sempre o
   * canônico (55 + número).
   */
  async findOrCreateConversation(barbershopId: string, phone: string) {
    const normalized = canonicalAiPhone(phone);
    if (normalized.length < 10) throw new AppError("Telefone inválido", 400);

    const candidates = aiPhoneCandidates(phone);
    const existing = await prisma.aiConversation.findFirst({
      where: {
        barbershopId,
        normalizedPhone: { in: candidates.length ? candidates : [normalized] },
        status: "ACTIVE",
      },
      select: conversationSelect,
    });
    if (existing) return existing;

    return prisma.aiConversation.create({
      data: {
        barbershopId,
        phone: truncatePhone(phone),
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

  // ─── Logs de intenção ──────────────────────────────────────────────────────

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
        phone: truncatePhone(data.phone),
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

  /** Estatísticas agregadas no banco (sem carregar todos os logs na memória). */
  async getIntentStats(barbershopId: string) {
    const [byIntentRows, byHandledByRows, confidence, total] = await Promise.all([
      prisma.aiIntentLog.groupBy({
        by: ["intent"],
        where: { barbershopId },
        _count: { _all: true },
      }),
      prisma.aiIntentLog.groupBy({
        by: ["handledBy"],
        where: { barbershopId },
        _count: { _all: true },
      }),
      prisma.aiIntentLog.aggregate({
        where: { barbershopId },
        _avg: { confidence: true },
      }),
      prisma.aiIntentLog.count({ where: { barbershopId } }),
    ]);

    const byIntent: Record<string, number> = {};
    for (const row of byIntentRows) byIntent[row.intent] = row._count._all;

    const byHandledBy: Record<string, number> = {};
    for (const row of byHandledByRows) byHandledBy[row.handledBy] = row._count._all;

    return {
      total,
      byIntent,
      byHandledBy,
      avgConfidence: confidence._avg.confidence ?? 0,
    };
  }

  // ─── Salão ─────────────────────────────────────────────────────────────────

  /** Dados públicos do salão usados para responder de verdade. */
  async getSalonContext(barbershopId: string): Promise<AiSalonContext | null> {
    const shop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: {
        id: true,
        name: true,
        whatsapp: true,
        address: true,
        city: true,
        latitude: true,
        longitude: true,
        timezone: true,
        businessSegment: true,
        openingMode: true,
        manualStatus: true,
        active: true,
        schedules: {
          select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true },
          orderBy: { dayOfWeek: "asc" },
        },
        services: {
          where: { active: true, publicBookable: true },
          select: { name: true, price: true, avgTimeMinutes: true },
          orderBy: { name: "asc" },
        },
      },
    });

    if (!shop) return null;

    return {
      id: shop.id,
      name: shop.name,
      whatsapp: shop.whatsapp,
      address: shop.address,
      city: shop.city,
      latitude: shop.latitude,
      longitude: shop.longitude,
      timezone: shop.timezone,
      businessSegment: shop.businessSegment,
      openingMode: shop.openingMode,
      manualStatus: shop.manualStatus,
      schedules: shop.schedules,
      services: shop.services,
    };
  }

  /** Salão dono de uma instância da Evolution (`shop-<barbershopId>`). */
  async findSalonByInstance(instanceName: string): Promise<AiResolvedSalon | null> {
    const shop = await prisma.barbershop.findFirst({
      where: { evolutionInstanceName: instanceName },
      select: salonSummarySelect,
    });
    if (!shop) return null;
    return { id: shop.id, name: shop.name, source: "instance" };
  }

  /** Configuração do atendente de IA no salão. */
  async getAiSettings(barbershopId: string) {
    return prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { id: true, name: true, active: true, whatsappAiEnabled: true },
    });
  }

  async setAiEnabled(barbershopId: string, enabled: boolean) {
    return prisma.barbershop.update({
      where: { id: barbershopId },
      data: { whatsappAiEnabled: enabled },
      select: { id: true, name: true, active: true, whatsappAiEnabled: true },
    });
  }

  // ─── Resolução de salão pelo número do cliente ────────────────────────────

  /**
   * Salões em que o cliente (número) é conhecido.
   *
   * Duas fontes, para o cliente não depender de ter usado o portal:
   * - `client_salon_links` confirmado (portal do cliente);
   * - `salon_clients` do CRM do salão (telefone cadastrado).
   *
   * A mesma técnica usada pelo assistente do dono (`findActiveLinksByPhone`),
   * agora para o cliente final.
   */
  async resolveSalonsByPhone(phone: string): Promise<AiResolvedSalon[]> {
    const candidates = aiPhoneCandidates(phone);
    if (candidates.length === 0) return [];

    const identities = await prisma.clientIdentity.findMany({
      where: { normalizedPhone: { in: candidates } },
      select: { id: true },
    });
    const identityIds = identities.map((identity) => identity.id);

    const [links, crmClients] = await Promise.all([
      identityIds.length
        ? prisma.clientSalonLink.findMany({
            where: {
              identityId: { in: identityIds },
              status: "CONFIRMED",
              revocationAt: null,
            },
            select: { barbershopId: true, barbershop: { select: salonSummarySelect } },
          })
        : Promise.resolve([]),
      prisma.salonClient.findMany({
        where: { normalizedWhatsapp: { in: candidates.filter((c) => c.length <= 11) } },
        select: { barbershopId: true, barbershop: { select: salonSummarySelect } },
      }),
    ]);

    const byId = new Map<string, AiResolvedSalon>();
    for (const link of links) {
      if (!link.barbershop.active) continue;
      byId.set(link.barbershop.id, {
        id: link.barbershop.id,
        name: link.barbershop.name,
        source: "client_link",
      });
    }
    for (const client of crmClients) {
      if (!client.barbershop.active) continue;
      if (byId.has(client.barbershop.id)) continue;
      byId.set(client.barbershop.id, {
        id: client.barbershop.id,
        name: client.barbershop.name,
        source: "client_crm",
      });
    }

    // Ordem estável (nome): a lista de unidades enviada ao cliente precisa ter
    // a mesma ordem quando ele escolhe pelo número.
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }
}
