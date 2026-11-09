import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ListServicesUseCase } from "./ListServicesUseCase";
import { AppError } from "@/shared/errors/AppError";
import { listServicesQuerySchema } from "../../schemas/serviceSchemas";
import { buildPaginationMeta } from "@/shared/utils/pagination";

export class ListServicesController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const barbershopId = (request.query as { barbershopId?: string }).barbershopId;
    if (!barbershopId) throw new AppError("barbershopId é obrigatório", 400);

    // Visão pública: só serviços agendáveis pelo cliente (`publicBookable`).
    // Visão staff (token válido do próprio estabelecimento): lista completa,
    // incluindo serviços internos como audiência ou diligência.
    const user = request.user;
    const isStaffOfShop =
      !!user &&
      (user.role === "MASTER_ADMIN" ||
        user.barbershopId === barbershopId ||
        (user as { barbershopId?: string }).barbershopId === barbershopId);

    // Filtros e ordenação são opcionais; o salão NÃO é filtro (vem do
    // contexto resolvido acima).
    const query = listServicesQuerySchema.parse(request.query);

    const useCase = container.resolve(ListServicesUseCase);
    const result = await useCase.executePaginated(
      barbershopId,
      query,
      { includeInternal: isStaffOfShop },
    );

    // `data` continua sendo o array de serviços (o front e a página pública
    // dependem disso); a paginação vem no `meta`.
    reply.send({
      success: true,
      data: result.data,
      meta: buildPaginationMeta(result.total, query.page, query.limit),
    });
  }
}
