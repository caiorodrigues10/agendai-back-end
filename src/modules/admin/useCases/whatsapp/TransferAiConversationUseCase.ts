import { AppError } from "@/shared/errors/AppError";
import { IAdminWhatsAppConversationRepository } from "../../repositories/AdminWhatsAppConversationRepository";

export interface TransferAiConversationInput {
  id: string;
  reason: string;
  userId: string;
  ipAddress?: string;
}

export class TransferAiConversationUseCase {
  constructor(private readonly repo: IAdminWhatsAppConversationRepository) {}

  async execute(input: TransferAiConversationInput) {
    const conversation = await this.repo.findSummary(input.id);
    if (!conversation) throw new AppError("Conversa não encontrada", 404);

    return this.repo.transfer({
      id: conversation.id,
      barbershopId: conversation.barbershopId,
      reason: input.reason,
      userId: input.userId,
      ipAddress: input.ipAddress,
    });
  }
}
