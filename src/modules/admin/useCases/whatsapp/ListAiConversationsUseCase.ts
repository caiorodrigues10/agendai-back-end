import { maskPhone } from "@/modules/whatsappOwnerBot/messages";
import { IAdminWhatsAppConversationRepository } from "../../repositories/AdminWhatsAppConversationRepository";

export interface ListAiConversationsInput {
  page: number;
  limit: number;
  barbershopId?: string;
  status?: string;
}

export class ListAiConversationsUseCase {
  constructor(private readonly repo: IAdminWhatsAppConversationRepository) {}

  async execute(input: ListAiConversationsInput) {
    const { conversations, total } = await this.repo.list(input);
    const data = conversations.map((conversation) => ({
      id: conversation.id,
      barbershopId: conversation.barbershopId,
      barbershopName: conversation.barbershop?.name,
      phoneMasked: maskPhone(conversation.phone),
      status: conversation.status,
      startedAt: conversation.startedAt,
      lastMessageAt: conversation.lastMessageAt,
      endedAt: conversation.endedAt,
      messageCount: conversation._count.messages,
    }));

    return {
      data,
      meta: {
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
      },
    };
  }
}
