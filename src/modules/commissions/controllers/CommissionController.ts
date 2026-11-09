import { FastifyReply, FastifyRequest } from "fastify";
import { container } from "tsyringe";
import { buildPaginationMeta } from "@/shared/utils/pagination";
import { resolveBarbershopId } from "@/shared/utils/barbershopScope";
import { getShopTimezone } from "@/modules/financial/ledger/shopTime";
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

  /**
   * Fuso do salão para o filtro de período: `createdAt` é timestamp, então o
   * dia civil de `from`/`to` é o do salão. Só consulta o fuso quando há
   * período — sem `from`/`to` o fuso é irrelevante.
   */
  private async timeZone(barbershopId: string, query: { from?: string; to?: string }): Promise<string | undefined> {
    if (!query.from && !query.to) return undefined;
    return getShopTimezone(barbershopId);
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = listCommissionsQuerySchema.parse(request.query);
    const barbershopId = this.barbershopId(request);
    const timeZone = await this.timeZone(barbershopId, query);
    const result = await this.repository().list(barbershopId, { ...query, timeZone });
    reply.send({
      success: true,
      data: result.data,
      meta: buildPaginationMeta(result.total, query.page, query.limit),
    });
  }

  async summary(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = listCommissionsQuerySchema.parse(request.query);
    const barbershopId = this.barbershopId(request);
    const timeZone = await this.timeZone(barbershopId, query);
    const result = await this.repository().summary(barbershopId, {
      from: query.from,
      to: query.to,
      professionalId: query.professionalId,
      serviceId: query.serviceId,
      origin: query.origin,
      timeZone,
    });
    reply.send({ success: true, data: result });
  }
}
