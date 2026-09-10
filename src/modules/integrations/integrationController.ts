import { FastifyRequest, FastifyReply } from "fastify";
import { IntegrationUseCases } from "./integrationUseCases";
import { createIntegrationSchema, updateIntegrationSchema, triggerSyncSchema } from "./integrationSchema";
import { AppError } from "@/shared/errors/AppError";

function barbershopId(request: FastifyRequest, fallback?: string) {
  const user = request.user!;
  const id = user.role === "MASTER_ADMIN" ? fallback || user.barbershopId : user.barbershopId;
  if (!id) throw new AppError("barbershopId é obrigatório", 400);
  return id;
}

export class IntegrationController {
  private useCases = new IntegrationUseCases();

  async create(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId: paramId } = request.params as { barbershopId: string };
    const bsId = barbershopId(request, paramId);
    const body = createIntegrationSchema.parse(request.body);
    const data = await this.useCases.configure(bsId, body);
    reply.status(201).send({ success: true, data });
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId: paramId } = request.params as { barbershopId: string };
    const bsId = barbershopId(request, paramId);
    const data = await this.useCases.list(bsId);
    reply.send({ success: true, data });
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId: paramId, id } = request.params as { barbershopId: string; id: string };
    const bsId = barbershopId(request, paramId);
    const data = await this.useCases.getById(id, bsId);
    reply.send({ success: true, data });
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId: paramId, id } = request.params as { barbershopId: string; id: string };
    const bsId = barbershopId(request, paramId);
    const body = updateIntegrationSchema.parse(request.body);
    const data = await this.useCases.update(id, bsId, body);
    reply.send({ success: true, data });
  }

  async delete(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId: paramId, id } = request.params as { barbershopId: string; id: string };
    const bsId = barbershopId(request, paramId);
    await this.useCases.delete(id, bsId);
    reply.status(204).send();
  }

  async testConnection(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId: paramId, id } = request.params as { barbershopId: string; id: string };
    const bsId = barbershopId(request, paramId);
    const data = await this.useCases.testConnection(id, bsId);
    reply.send({ success: true, data });
  }

  async triggerSync(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId: paramId, id } = request.params as { barbershopId: string; id: string };
    const bsId = barbershopId(request, paramId);
    const body = triggerSyncSchema.parse(request.body ?? {});
    const data = await this.useCases.triggerSync(id, bsId, body.direction);
    reply.send({ success: true, data });
  }

  async getSyncLogs(request: FastifyRequest, reply: FastifyReply) {
    const { barbershopId: paramId, id } = request.params as { barbershopId: string; id: string };
    const bsId = barbershopId(request, paramId);
    const query = request.query as { page?: string; limit?: string };
    const page = parseInt(query.page ?? "1", 10);
    const limit = Math.min(parseInt(query.limit ?? "20", 10), 100);
    const result = await this.useCases.getSyncLogs(id, bsId, page, limit);
    reply.send({ success: true, data: result.data, meta: result.meta });
  }
}
