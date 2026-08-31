import { FastifyReply, FastifyRequest } from "fastify";
import { container } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { ICommissionRepository } from "../repositories/ICommissionRepository";
import { listCommissionsQuerySchema } from "../schemas/commissionSchemas";

export class CommissionController {
  private repository(): ICommissionRepository {
    return container.resolve<ICommissionRepository>("CommissionRepository");
  }

  private barbershopId(request: FastifyRequest): string {
    const user = request.user!;
    const requested = (request.query as { barbershopId?: string }).barbershopId;
    const id = user.role === "MASTER_ADMIN" ? requested : user.barbershopId;
    if (!id) throw new AppError("barbershopId é obrigatório", 400);
    return id;
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = listCommissionsQuerySchema.parse(request.query);
    const result = await this.repository().list(this.barbershopId(request), query);
    reply.send({
      success: true,
      data: result.data,
      meta: { total: result.total, page: query.page, limit: query.limit, totalPages: Math.ceil(result.total / query.limit) },
    });
  }

  async summary(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = listCommissionsQuerySchema.omit({ page: true, limit: true }).parse(request.query);
    const result = await this.repository().summary(this.barbershopId(request), query);
    reply.send({ success: true, data: result });
  }
}
