import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { FiscalRepository } from "./fiscalRepository";
import type { FiscalConfigInput, IssueNfeInput } from "./fiscalSchema";

export class FiscalUseCases {
  private repo = new FiscalRepository();

  async getConfig(barbershopId: string) {
    const config = await this.repo.getConfig(barbershopId);
    return config ?? null;
  }

  async updateConfig(barbershopId: string, data: FiscalConfigInput) {
    return this.repo.upsertConfig(barbershopId, data);
  }

  async issueNfe(barbershopId: string, input: IssueNfeInput) {
    const config = await this.repo.getConfig(barbershopId);
    if (!config) {
      throw new AppError("Fiscal configuration not found. Configure fiscal data first.", 400);
    }
    if (!config.nfeEnabled) {
      throw new AppError("NFS-e is not enabled in fiscal configuration.", 400);
    }

    const sequence = await this.repo.getNextSequence(barbershopId);
    const nfseNumber = String(sequence).padStart(6, "0");
    const nfseProtocol = `PROTO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const record = await this.repo.createNfeRecord({
      barbershopId,
      configId: config.id,
      appointmentId: input.appointmentId ?? null,
      nfseNumber,
      nfseProtocol,
      recipientName: input.recipientName,
      recipientDoc: input.recipientDoc,
      serviceValue: input.serviceValue,
      taxValue: input.taxValue,
    });

    return record;
  }

  async listRecords(barbershopId: string, options: { status?: string; page: number; limit: number }) {
    const skip = (options.page - 1) * options.limit;
    return this.repo.listNfeRecords(barbershopId, {
      status: options.status,
      skip,
      take: options.limit,
    });
  }

  async getRecord(barbershopId: string, id: string) {
    const record = await this.repo.findNfeRecord(barbershopId, id);
    if (!record) throw new AppError("NFS-e record not found", 404);
    return record;
  }

  async cancelNfe(barbershopId: string, id: string) {
    const record = await this.repo.findNfeRecord(barbershopId, id);
    if (!record) throw new AppError("NFS-e record not found", 404);
    if (record.status === "CANCELED") throw new AppError("NFS-e is already canceled", 400);
    if (record.status !== "AUTHORIZED") throw new AppError("Only authorized NFS-e can be canceled", 400);
    return this.repo.cancelNfeRecord(barbershopId, id);
  }

  async getStats(barbershopId: string, months: number) {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months);
    return this.repo.getStats(barbershopId, since);
  }
}
