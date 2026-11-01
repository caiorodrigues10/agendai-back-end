import { AppError } from "@/shared/errors/AppError";
import { IAdminWhatsAppInstanceRepository } from "../../repositories/AdminWhatsAppInstanceRepository";
import { IAdminWhatsAppAuditRepository } from "../../repositories/AdminWhatsAppAuditRepository";
import {
  createEvolutionInstance,
  fetchEvolutionConnectionState,
  fetchEvolutionQr,
} from "@/shared/services/evolutionApiService";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("admin:whatsapp");

export interface ReconnectWhatsAppInstanceInput {
  shopId: string;
  reason: string;
  userId: string;
  ipAddress?: string;
}

export class ReconnectWhatsAppInstanceUseCase {
  constructor(
    private readonly instanceRepo: IAdminWhatsAppInstanceRepository,
    private readonly auditRepo: IAdminWhatsAppAuditRepository
  ) {}

  async execute(input: ReconnectWhatsAppInstanceInput) {
    const shop = await this.instanceRepo.findShop(input.shopId);
    if (!shop) throw new AppError("Conta não encontrada", 404);
    const instanceName = shop.evolutionInstanceName?.trim();
    if (!instanceName) throw new AppError("Salão sem instância configurada", 400);

    let state = "close";
    try {
      state = await fetchEvolutionConnectionState(instanceName);
    } catch (err) {
      logger.warn({ err }, "state check failed");
      state = "unreachable";
    }

    let qrcodeBase64: string | null = null;
    if (state !== "open") {
      qrcodeBase64 = await fetchEvolutionQr(instanceName).catch(() => null);
      if (!qrcodeBase64) {
        try {
          await createEvolutionInstance(instanceName, { qrcode: true });
          qrcodeBase64 = await fetchEvolutionQr(instanceName).catch(() => null);
        } catch {
          throw new AppError("Não foi possível reconectar a instância", 502);
        }
      }
    }

    await this.auditRepo.create({
      userId: input.userId,
      action: "WHATSAPP_INSTANCE_RECONNECT",
      resource: "Barbershop",
      resourceId: shop.id,
      details: { reason: input.reason, instanceName, state },
      ipAddress: input.ipAddress,
      barbershopId: shop.id,
    });

    return { instanceName, state, qrcodeBase64 };
  }
}
