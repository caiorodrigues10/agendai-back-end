import { PlatformWhatsAppSettings } from "@/shared/services/platformWhatsAppSettings";

export interface UpdatePlatformWhatsAppSettingsInput {
  aiGloballyEnabled?: boolean;
  ownerBotGloballyEnabled?: boolean;
  outboundPaused?: boolean;
  reason: string;
  updatedBy?: string | null;
}

export interface IPlatformWhatsAppSettingsRepository {
  get(): Promise<PlatformWhatsAppSettings>;
  update(input: UpdatePlatformWhatsAppSettingsInput): Promise<PlatformWhatsAppSettings>;
}
