import { IAdminWhatsAppShopRepository } from "../../repositories/AdminWhatsAppShopRepository";

export interface ListWhatsAppShopsInput {
  page: number;
  limit: number;
  search?: string;
  aiEnabled?: boolean;
}

export interface ListWhatsAppShopsOutput {
  data: Array<{
    id: string;
    name: string;
    city: string | null;
    active: boolean;
    approvalStatus: string;
    whatsappAiEnabled: boolean;
    evolutionInstanceName: string | null;
    ownerBot: { enabled: boolean; blocked: boolean; blockedAt: Date | null } | null;
    counts: { aiConversations: number; OwnerBotActionLog: number };
  }>;
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export class ListWhatsAppShopsUseCase {
  constructor(private readonly repo: IAdminWhatsAppShopRepository) {}

  async execute(input: ListWhatsAppShopsInput): Promise<ListWhatsAppShopsOutput> {
    const { shops, total } = await this.repo.list(input);

    return {
      data: shops.map((shop) => ({
        id: shop.id,
        name: shop.name,
        city: shop.city,
        active: shop.active,
        approvalStatus: shop.approvalStatus,
        whatsappAiEnabled: shop.whatsappAiEnabled,
        evolutionInstanceName: shop.evolutionInstanceName,
        ownerBot: shop.OwnerBotPreference
          ? {
              enabled: shop.OwnerBotPreference.enabled,
              blocked: shop.OwnerBotPreference.blocked,
              blockedAt: shop.OwnerBotPreference.blockedAt,
            }
          : null,
        counts: shop._count,
      })),
      meta: {
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
      },
    };
  }
}
