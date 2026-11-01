import { IPlatformWhatsAppSettingsRepository } from "../../repositories/IPlatformWhatsAppSettingsRepository";

export class GetPlatformWhatsAppSettingsUseCase {
  constructor(private repo: IPlatformWhatsAppSettingsRepository) {}
  execute() { return this.repo.get(); }
}
