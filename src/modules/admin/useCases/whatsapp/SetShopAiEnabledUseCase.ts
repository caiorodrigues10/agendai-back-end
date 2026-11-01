import { AppError } from "@/shared/errors/AppError";
import { IAdminWhatsAppShopRepository } from "../../repositories/AdminWhatsAppShopRepository";

export interface SetShopAiEnabledInput {
  id: string;
  enabled: boolean;
  reason: string;
  userId: string;
  ipAddress?: string;
}

export class SetShopAiEnabledUseCase {
  constructor(private readonly repo: IAdminWhatsAppShopRepository) {}

  async execute(input: SetShopAiEnabledInput) {
    const shop = await this.repo.findById(input.id);
    if (!shop) throw new AppError("Conta não encontrada", 404);

    return this.repo.applyAiSingle({
      id: shop.id,
      before: shop.whatsappAiEnabled,
      enabled: input.enabled,
      audit: { userId: input.userId, ipAddress: input.ipAddress, reason: input.reason },
    });
  }
}
