import { prisma } from "@/libs/prismaClient";

export interface AdminWhatsAppConversationListQuery {
  page: number;
  limit: number;
  barbershopId?: string;
  status?: string;
}

export interface AdminWhatsAppConversationListItem {
  id: string;
  barbershopId: string;
  phone: string;
  status: string;
  startedAt: Date;
  lastMessageAt: Date;
  endedAt: Date | null;
  barbershop: { name: string } | null;
  _count: { messages: number };
}

export interface AdminWhatsAppConversationDetail {
  id: string;
  barbershopId: string;
  phone: string;
  status: string;
  context: unknown;
  startedAt: Date;
  lastMessageAt: Date;
  endedAt: Date | null;
  barbershop: { id: string; name: string } | null;
  messages: Array<{
    id: string;
    direction: string;
    content: string;
    messageType: string;
    intent: string | null;
    confidence: number | null;
    sentAt: Date;
  }>;
}

export interface AdminWhatsAppConversationSummary {
  id: string;
  barbershopId: string;
  status: string;
  endedAt: Date | null;
}

export interface IAdminWhatsAppConversationRepository {
  list(query: AdminWhatsAppConversationListQuery): Promise<{
    conversations: AdminWhatsAppConversationListItem[];
    total: number;
  }>;
  findDetail(id: string): Promise<AdminWhatsAppConversationDetail | null>;
  findSummary(id: string): Promise<AdminWhatsAppConversationSummary | null>;
  transfer(input: {
    id: string;
    barbershopId: string;
    reason: string;
    userId: string;
    ipAddress?: string;
  }): Promise<AdminWhatsAppConversationSummary>;
}

export class AdminWhatsAppConversationRepository implements IAdminWhatsAppConversationRepository {
  async list(query: AdminWhatsAppConversationListQuery) {
    const where = {
      ...(query.barbershopId ? { barbershopId: query.barbershopId } : {}),
      ...(query.status ? { status: query.status as never } : {}),
    };

    const [conversations, total] = await Promise.all([
      prisma.aiConversation.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { lastMessageAt: "desc" },
        select: {
          id: true,
          barbershopId: true,
          phone: true,
          status: true,
          startedAt: true,
          lastMessageAt: true,
          endedAt: true,
          barbershop: { select: { name: true } },
          _count: { select: { messages: true } },
        },
      }),
      prisma.aiConversation.count({ where }),
    ]);

    return { conversations, total };
  }

  findDetail(id: string): Promise<AdminWhatsAppConversationDetail | null> {
    return prisma.aiConversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { sentAt: "asc" }, take: 200 },
        barbershop: { select: { id: true, name: true } },
      },
    }) as Promise<AdminWhatsAppConversationDetail | null>;
  }

  findSummary(id: string): Promise<AdminWhatsAppConversationSummary | null> {
    return prisma.aiConversation.findUnique({
      where: { id },
      select: { id: true, barbershopId: true, status: true, endedAt: true },
    });
  }

  transfer(input: {
    id: string;
    barbershopId: string;
    reason: string;
    userId: string;
    ipAddress?: string;
  }): Promise<AdminWhatsAppConversationSummary> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.aiConversation.update({
        where: { id: input.id },
        data: { status: "TRANSFERRED_TO_HUMAN", endedAt: new Date() },
        select: { id: true, barbershopId: true, status: true, endedAt: true },
      });
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          action: "WHATSAPP_AI_TRANSFER",
          resource: "AiConversation",
          resourceId: input.id,
          details: JSON.stringify({ reason: input.reason, barbershopId: input.barbershopId }),
          ipAddress: input.ipAddress,
          barbershopId: input.barbershopId,
        },
      });
      return updated;
    });
  }
}
