import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ListServicesUseCase } from "./ListServicesUseCase";
import { AppError } from "@/shared/errors/AppError";

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

    const useCase = container.resolve(ListServicesUseCase);
    const list = await useCase.execute(barbershopId, { includeInternal: isStaffOfShop });
    reply.send({ success: true, data: list });
  }
}
