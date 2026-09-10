import { FastifyRequest, FastifyReply } from "fastify";
import { AppError } from "@/shared/errors/AppError";
import { FiscalUseCases } from "./fiscalUseCases";
import {
  fiscalConfigSchema,
  issueNfeSchema,
  nfeQuerySchema,
  fiscalStatsQuerySchema,
} from "./fiscalSchema";

export class FiscalController {
  private useCases = new FiscalUseCases();

  async getConfig(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const config = await this.useCases.getConfig(barbershopId);
    reply.send({ success: true, data: config });
  }

  async updateConfig(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const body = fiscalConfigSchema.parse(request.body);
    const config = await this.useCases.updateConfig(barbershopId, body);
    reply.send({ success: true, data: config });
  }

  async issueNfe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const body = issueNfeSchema.parse(request.body);
    const record = await this.useCases.issueNfe(barbershopId, body);
    reply.status(201).send({ success: true, data: record });
  }

  async listRecords(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const query = nfeQuerySchema.parse(request.query);
    const result = await this.useCases.listRecords(barbershopId, query);
    reply.send({ success: true, data: result.records, total: result.total });
  }

  async getRecord(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const record = await this.useCases.getRecord(barbershopId, id);
    reply.send({ success: true, data: record });
  }

  async cancelNfe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const record = await this.useCases.cancelNfe(barbershopId, id);
    reply.send({ success: true, data: record });
  }

  async getStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { barbershopId } = request.params as { barbershopId: string };
    const { months } = fiscalStatsQuerySchema.parse(request.query);
    const stats = await this.useCases.getStats(barbershopId, months);
    reply.send({ success: true, data: stats });
  }
}
