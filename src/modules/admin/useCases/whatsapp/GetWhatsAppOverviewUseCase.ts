import { IPlatformWhatsAppSettingsRepository } from "../../repositories/IPlatformWhatsAppSettingsRepository";
import { IAdminWhatsAppOverviewRepository } from "../../repositories/AdminWhatsAppOverviewRepository";
import { IAdminWhatsAppQueueGateway, WHATSAPP_QUEUE_NAMES } from "../../repositories/AdminWhatsAppQueueGateway";
import {
  AdminWhatsAppInstanceState,
  FetchInstanceState,
  defaultFetchInstanceState,
  resolveInstanceStates,
} from "./whatsappInstanceState";

export interface GetWhatsAppOverviewOutput {
  generatedAt: string;
  globalSettings: unknown;
  instances: {
    ai: { name: string | null; state: AdminWhatsAppInstanceState | null; error?: string };
    platform: { name: string | null; state: AdminWhatsAppInstanceState | null; error?: string };
  };
  counts: {
    shopsWithAiEnabled: number;
    shopsWithOwnerBotEnabled: number;
    aiConversationsTotal: number;
    aiMessages24h: number;
    ownerBotActions24h: number;
  };
  queues: unknown;
}

export class GetWhatsAppOverviewUseCase {
  constructor(
    private readonly settingsRepo: IPlatformWhatsAppSettingsRepository,
    private readonly overviewRepo: IAdminWhatsAppOverviewRepository,
    private readonly queueGateway: IAdminWhatsAppQueueGateway,
    private readonly fetchState: FetchInstanceState = defaultFetchInstanceState
  ) {}

  async execute(): Promise<GetWhatsAppOverviewOutput> {
    const settings = await this.settingsRepo.get();
    const aiInstance = process.env.EVOLUTION_AI_INSTANCE_NAME?.trim() || null;
    const platformInstance = process.env.EVOLUTION_INSTANCE_NAME?.trim() || null;

    const names = [aiInstance, platformInstance].filter((name): name is string => Boolean(name));
    const states = await resolveInstanceStates(names, this.fetchState);
    const aiState = aiInstance ? states.get(aiInstance) : undefined;
    const platformState = platformInstance ? states.get(platformInstance) : undefined;

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [counts, queues] = await Promise.all([
      this.overviewRepo.countsSince(since24h),
      this.queueGateway.counts(WHATSAPP_QUEUE_NAMES),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      globalSettings: settings,
      instances: {
        ai: {
          name: aiInstance,
          state: aiState?.state ?? null,
          ...(aiState?.error ? { error: aiState.error } : {}),
        },
        platform: {
          name: platformInstance,
          state: platformState?.state ?? null,
          ...(platformState?.error ? { error: platformState.error } : {}),
        },
      },
      counts,
      queues,
    };
  }
}
