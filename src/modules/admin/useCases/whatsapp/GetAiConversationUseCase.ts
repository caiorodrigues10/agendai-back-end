import { AppError } from "@/shared/errors/AppError";
import { maskPhone } from "@/modules/whatsappOwnerBot/messages";
import { IAdminWhatsAppConversationRepository } from "../../repositories/AdminWhatsAppConversationRepository";

export class GetAiConversationUseCase {
  constructor(private readonly repo: IAdminWhatsAppConversationRepository) {}

  async execute(id: string) {
    const conversation = await this.repo.findDetail(id);
    if (!conversation) throw new AppError("Conversa não encontrada", 404);

    return {
      id: conversation.id,
      barbershopId: conversation.barbershopId,
      barbershopName: conversation.barbershop?.name,
      phoneMasked: maskPhone(conversation.phone),
      status: conversation.status,
      context: conversation.context,
      startedAt: conversation.startedAt,
      lastMessageAt: conversation.lastMessageAt,
      endedAt: conversation.endedAt,
      messages: conversation.messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        content: message.content,
        messageType: message.messageType,
        intent: message.intent,
        confidence: message.confidence,
        sentAt: message.sentAt,
      })),
    };
  }
}
