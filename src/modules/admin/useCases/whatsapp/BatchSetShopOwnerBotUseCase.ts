import { AppError } from "@/shared/errors/AppError";
import { IAdminWhatsAppShopRepository } from "../../repositories/AdminWhatsAppShopRepository";

export interface BatchSetShopOwnerBotInput {
  ids: string[];
  enabled?: boolean;
  blocked?: boolean;
  reason: string;
  userId: string;
  ipAddress?: string;
}

export class BatchSetShopOwnerBotUseCase {
  constructor(private readonly repo: IAdminWhatsAppShopRepository) {}

  async execute(input: BatchSetShopOwnerBotInput) {
    const targets = await this.repo.findAiTargets(input.ids);
    const found = new Set(targets.map((target) => target.id));
    const missing = input.ids.filter((id) => !found.has(id));
    if (missing.length) {
      throw new AppError(`Salões não encontrados: ${missing.join(", ")}`, 404);
    }

    const updated = await this.repo.applyOwnerBotBatch({
      ids: input.ids,
      patch: { enabled: input.enabled, blocked: input.blocked },
      audit: { userId: input.userId, ipAddress: input.ipAddress, reason: input.reason },
    });

    return { updated };
  }
}
