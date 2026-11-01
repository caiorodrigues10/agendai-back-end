import {
  IPlatformWhatsAppSettingsRepository,
  UpdatePlatformWhatsAppSettingsInput,
} from "../../repositories/IPlatformWhatsAppSettingsRepository";
import { IAdminWhatsAppAuditRepository } from "../../repositories/AdminWhatsAppAuditRepository";

export class UpdatePlatformWhatsAppSettingsUseCase {
  constructor(
    private readonly repo: IPlatformWhatsAppSettingsRepository,
    private readonly auditRepo: IAdminWhatsAppAuditRepository
  ) {}

  async execute(input: UpdatePlatformWhatsAppSettingsInput & { ipAddress?: string }) {
    const updated = await this.repo.update(input);

    await this.auditRepo.create({
      userId: input.updatedBy ?? "",
      action: "WHATSAPP_PLATFORM_SETTINGS_UPDATE",
      resource: "PlatformWhatsAppSetting",
      resourceId: "global",
      details: { reason: input.reason, after: updated },
      ipAddress: input.ipAddress,
    });

    return updated;
  }
}
