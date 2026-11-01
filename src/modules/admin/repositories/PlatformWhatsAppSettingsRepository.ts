import {
  IPlatformWhatsAppSettingsRepository,
  UpdatePlatformWhatsAppSettingsInput,
} from "./IPlatformWhatsAppSettingsRepository";
import { getPlatformWhatsAppSettings, updatePlatformWhatsAppSettings } from "@/shared/services/platformWhatsAppSettings";

export class PlatformWhatsAppSettingsRepository implements IPlatformWhatsAppSettingsRepository {
  get() { return getPlatformWhatsAppSettings(); }
  update(input: UpdatePlatformWhatsAppSettingsInput) {
    return updatePlatformWhatsAppSettings(input);
  }
}
