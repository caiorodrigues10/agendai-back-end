import { IAdminWhatsAppInstanceRepository } from "../../repositories/AdminWhatsAppInstanceRepository";
import {
  AdminWhatsAppInstanceState,
  FetchInstanceState,
  defaultFetchInstanceState,
  resolveInstanceStates,
} from "./whatsappInstanceState";

export interface WhatsAppInstanceView {
  kind: "ai" | "platform" | "shop";
  name: string;
  state: AdminWhatsAppInstanceState;
  error?: string;
  shopId?: string;
  shopName?: string;
}

export interface ListWhatsAppInstancesInput {
  page: number;
  limit: number;
}

export interface ListWhatsAppInstancesOutput {
  data: WhatsAppInstanceView[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export class ListWhatsAppInstancesUseCase {
  constructor(
    private readonly repo: IAdminWhatsAppInstanceRepository,
    private readonly fetchState: FetchInstanceState = defaultFetchInstanceState
  ) {}

  async execute(input: ListWhatsAppInstancesInput): Promise<ListWhatsAppInstancesOutput> {
    const aiInstance = process.env.EVOLUTION_AI_INSTANCE_NAME?.trim() || null;
    const platformInstance = process.env.EVOLUTION_INSTANCE_NAME?.trim() || null;

    const { shops, total } = await this.repo.listShops({
      page: input.page,
      limit: input.limit,
    });

    const shopInstances = shops
      .map((shop) => ({
        shop,
        instanceName: shop.evolutionInstanceName?.trim() ?? null,
      }))
      .filter((entry): entry is { shop: (typeof shops)[number]; instanceName: string } =>
        Boolean(entry.instanceName)
      );

    const platformEntries: WhatsAppInstanceView[] = [];
    const names: string[] = [];

    if (input.page === 1) {
      if (aiInstance) {
        platformEntries.push({ kind: "ai", name: aiInstance, state: "unreachable" });
        names.push(aiInstance);
      }
      if (platformInstance) {
        platformEntries.push({ kind: "platform", name: platformInstance, state: "unreachable" });
        names.push(platformInstance);
      }
    }

    for (const entry of shopInstances) {
      platformEntries.push({
        kind: "shop",
        shopId: entry.shop.id,
        shopName: entry.shop.name,
        name: entry.instanceName,
        state: "unreachable",
      });
      names.push(entry.instanceName);
    }

    const states = await resolveInstanceStates(names, this.fetchState);

    const data = platformEntries.map((entry) => {
      const resolved = states.get(entry.name);
      return resolved
        ? { ...entry, state: resolved.state, error: resolved.error }
        : entry;
    });

    return {
      data,
      meta: {
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.max(1, Math.ceil(total / input.limit)),
      },
    };
  }
}
