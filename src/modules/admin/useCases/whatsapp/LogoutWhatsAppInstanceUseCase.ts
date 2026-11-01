import { AppError } from "@/shared/errors/AppError";
import { IAdminWhatsAppInstanceRepository } from "../../repositories/AdminWhatsAppInstanceRepository";
import { IAdminWhatsAppAuditRepository } from "../../repositories/AdminWhatsAppAuditRepository";
import { fetchEvolutionConnectionState, logoutEvolutionInstance } from "@/shared/services/evolutionApiService";

export interface LogoutWhatsAppInstanceInput {
  shopId: string;
  reason: string;
  userId: string;
  ipAddress?: string;
}

export class LogoutWhatsAppInstanceUseCase {
  constructor(
    private readonly instanceRepo: IAdminWhatsAppInstanceRepository,
    private readonly auditRepo: IAdminWhatsAppAuditRepository
  ) {}

  async execute(input: LogoutWhatsAppInstanceInput) {
    const shop = await this.instanceRepo.findShop(input.shopId);
    if (!shop) throw new AppError("Conta não encontrada", 404);
    const instanceName = shop.evolutionInstanceName?.trim();
    if (!instanceName) throw new AppError("Salão sem instância configurada", 400);

    try {
      await logoutEvolutionInstance(instanceName);
    } catch {
      await this.auditRepo.create({
        userId: input.userId,
        action: "WHATSAPP_INSTANCE_LOGOUT",
        resource: "Barbershop",
        resourceId: shop.id,
        details: { reason: input.reason, instanceName, status: "FAILED" },
        ipAddress: input.ipAddress,
        barbershopId: shop.id,
      });
      throw new AppError("Falha ao deslogar a instância", 502);
    }

    const state = await fetchEvolutionConnectionState(instanceName).catch(() => "close");
    await this.auditRepo.create({
      userId: input.userId,
      action: "WHATSAPP_INSTANCE_LOGOUT",
      resource: "Barbershop",
      resourceId: shop.id,
      details: { reason: input.reason, instanceName, state, status: "SUCCESS" },
      ipAddress: input.ipAddress,
      barbershopId: shop.id,
    });

    return { instanceName, state };
  }
}
