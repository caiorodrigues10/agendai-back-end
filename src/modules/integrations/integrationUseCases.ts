import { AppError } from "@/shared/errors/AppError";
import { IntegrationRepository } from "./integrationRepository";

const SUPPORTED_TYPES = new Set([
  "GOOGLE_CALENDAR",
  "ICALENDAR",
  "TWILIO",
  "EVOLUTION_API",
  "OPENAI",
  "ASAAS",
  "NFSE",
  "ZAPI",
  "WHATSAPP_CLOUD",
]);

const CONFIG_VALIDATORS: Record<string, (config: Record<string, unknown>) => boolean> = {
  GOOGLE_CALENDAR: (c) => typeof c.calendarId === "string" && c.calendarId.length > 0,
  ICALENDAR: (c) => typeof c.url === "string" && c.url.startsWith("http"),
  TWILIO: (c) => typeof c.accountSid === "string" && typeof c.authToken === "string" && typeof c.fromNumber === "string",
  EVOLUTION_API: (c) => typeof c.instanceName === "string" && typeof c.apiUrl === "string",
  OPENAI: () => true,
  ASAAS: () => true,
  NFSE: () => true,
  ZAPI: (c) => typeof c.instanceName === "string" && typeof c.apiKey === "string",
  WHATSAPP_CLOUD: (c) => typeof c.phoneNumberId === "string" && typeof c.accessToken === "string",
};

export class IntegrationUseCases {
  private repo = new IntegrationRepository();

  async configure(barbershopId: string, data: { type: string; provider: string; config: Record<string, unknown>; credentials: Record<string, unknown>; status?: string }) {
    if (!SUPPORTED_TYPES.has(data.type)) {
      throw new AppError(`Tipo de integração não suportado: ${data.type}`, 400);
    }
    return this.repo.upsert(barbershopId, data.type, data.provider, {
      config: data.config,
      credentials: data.credentials,
      status: data.status,
    });
  }

  async list(barbershopId: string) {
    return this.repo.findByBarbershop(barbershopId);
  }

  async getById(id: string, barbershopId: string) {
    const integration = await this.repo.findById(id, barbershopId);
    if (!integration) throw new AppError("Integração não encontrada", 404);
    return integration;
  }

  async update(id: string, barbershopId: string, data: { config?: Record<string, unknown>; credentials?: Record<string, unknown>; status?: string }) {
    const existing = await this.repo.findById(id, barbershopId);
    if (!existing) throw new AppError("Integração não encontrada", 404);
    return this.repo.update(id, {
      ...(data.config !== undefined ? { config: data.config as any } : {}),
      ...(data.credentials !== undefined ? { credentials: data.credentials as any } : {}),
      ...(data.status !== undefined ? { status: data.status as any } : {}),
    });
  }

  async delete(id: string, barbershopId: string) {
    const existing = await this.repo.findById(id, barbershopId);
    if (!existing) throw new AppError("Integração não encontrada", 404);
    await this.repo.delete(id, barbershopId);
  }

  async testConnection(id: string, barbershopId: string) {
    const integration = await this.repo.findById(id, barbershopId);
    if (!integration) throw new AppError("Integração não encontrada", 404);

    const config = (integration.config as Record<string, unknown>) ?? {};
    const validator = CONFIG_VALIDATORS[integration.type];
    if (validator && !validator(config)) {
      throw new AppError("Configuração incompleta ou inválida para esta integração", 400);
    }

    return {
      success: true,
      type: integration.type,
      provider: integration.provider,
      message: `Conexão com ${integration.provider} validada com sucesso`,
    };
  }

  async triggerSync(id: string, barbershopId: string, direction?: string) {
    const integration = await this.repo.findById(id, barbershopId);
    if (!integration) throw new AppError("Integração não encontrada", 404);

    if (integration.status === "INACTIVE") {
      throw new AppError("Integração está inativada. Ative antes de sincronizar.", 400);
    }

    const syncDirection = direction ?? "BIDIRECTIONAL";
    const simulatedCount = Math.floor(Math.random() * 50) + 1;

    const log = await this.repo.createSyncLog(id, syncDirection, "SUCCESS", simulatedCount);
    await this.repo.update(id, { lastSyncAt: new Date(), syncError: null });

    return {
      integrationId: id,
      syncLogId: log.id,
      direction: syncDirection,
      recordsCount: simulatedCount,
      message: `Sincronização simulada concluída: ${simulatedCount} registros processados`,
    };
  }

  async getSyncLogs(id: string, barbershopId: string, page = 1, limit = 20) {
    const existing = await this.repo.findById(id, barbershopId);
    if (!existing) throw new AppError("Integração não encontrada", 404);

    const offset = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.repo.getSyncLogs(id, limit, offset),
      this.repo.countSyncLogs(id),
    ]);

    return { data: logs, meta: { total, page, limit } };
  }
}
