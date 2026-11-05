import { FastifyReply, FastifyRequest } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { buildPaginationMeta, resolveBarbershopId } from "@/shared/utils/pagination";
import { ICommissionRepository } from "../repositories/ICommissionRepository";
import { listCommissionsQuerySchema } from "../schemas/commissionSchemas";

export class CommissionController {
  private repository(): ICommissionRepository {
    return container.resolve<ICommissionRepository>("CommissionRepository");
  }

  private barbershopId(request: FastifyRequest): string {
    const user = request.user!;
    const requested = (request.query as { barbershopId?: string }).barbershopId;
    return resolveBarbershopId(user, requested ?? null);
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = listCommissionsQuerySchema.parse(request.query);
    const result = await this.repository().list(this.barbershopId(request), query);
    reply.send({
      success: true,
      data: result.data,
      meta: buildPaginationMeta(result.total, query.page, query.limit),
    });
  }

  async summary(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = listCommissionsQuerySchema.omit({ page: true, limit: true }).parse(request.query);
    const result = await this.repository().summary(this.barbershopId(request), query);
    reply.send({ success: true, data: result });
  }
}
