import { AppError } from "@/shared/errors/AppError";
import { IAdminWhatsAppShopRepository } from "../../repositories/AdminWhatsAppShopRepository";

export interface SetShopOwnerBotInput {
  id: string;
  enabled?: boolean;
  blocked?: boolean;
  revokeLinks?: boolean;
  reason: string;
  userId: string;
  ipAddress?: string;
}

export class SetShopOwnerBotUseCase {
  constructor(private readonly repo: IAdminWhatsAppShopRepository) {}

  async execute(input: SetShopOwnerBotInput) {
    const shop = await this.repo.findById(input.id);
    if (!shop) throw new AppError("Conta não encontrada", 404);

    return this.repo.applyOwnerBotSingle({
      id: shop.id,
      patch: {
        enabled: input.enabled,
        blocked: input.blocked,
        revokeLinks: input.revokeLinks,
      },
      audit: { userId: input.userId, ipAddress: input.ipAddress, reason: input.reason },
    });
  }
}
