import { QualityRepository } from "./qualityRepository";
import { AppError } from "@/shared/errors/AppError";
import type { z } from "zod";
import type { createProtocolSchema, updateProtocolSchema, runAuditSchema, qualityOverviewQuerySchema } from "./qualitySchema";

type CreateProtocolInput = z.infer<typeof createProtocolSchema>;
type UpdateProtocolInput = z.infer<typeof updateProtocolSchema>;
type RunAuditInput = z.infer<typeof runAuditSchema>;
type OverviewQuery = z.infer<typeof qualityOverviewQuerySchema>;

export class QualityUseCases {
  private repo = new QualityRepository();

  async listProtocols(barbershopId: string) {
    return this.repo.listProtocols(barbershopId);
  }

  async getProtocolById(id: string, barbershopId: string) {
    const protocol = await this.repo.findProtocolById(id);
    if (!protocol) throw new AppError("Protocolo não encontrado", 404);
    if (protocol.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return protocol;
  }

  async createProtocol(barbershopId: string, data: CreateProtocolInput) {
    return this.repo.createProtocol({ ...data, barbershopId });
  }

  async updateProtocol(id: string, barbershopId: string, data: UpdateProtocolInput) {
    const existing = await this.repo.findProtocolById(id);
    if (!existing) throw new AppError("Protocolo não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.updateProtocol(id, data);
  }

  async deleteProtocol(id: string, barbershopId: string) {
    const existing = await this.repo.findProtocolById(id);
    if (!existing) throw new AppError("Protocolo não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.deleteProtocol(id);
  }

  async runAudit(barbershopId: string, data: RunAuditInput) {
    const protocol = await this.repo.findProtocolById(data.protocolId);
    if (!protocol) throw new AppError("Protocolo não encontrado", 404);
    if (protocol.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.createAudit({ ...data, barbershopId });
  }

  async listAudits(protocolId: string, barbershopId: string) {
    const protocol = await this.repo.findProtocolById(protocolId);
    if (!protocol) throw new AppError("Protocolo não encontrado", 404);
    if (protocol.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.listAudits(protocolId, barbershopId);
  }

  async getOverview(barbershopId: string, query: OverviewQuery) {
    return this.repo.getOverview(barbershopId, query.from, query.to);
  }
}
