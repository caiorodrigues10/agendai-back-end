import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { ListPaymentsUseCase } from "./ListPaymentsUseCase";
import { AppError } from "@/shared/errors/AppError";

export class ListPaymentsController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const {
      barbershopId,
      page = "1",
      limit = "20"
    } = request.query as { barbershopId?: string; page?: string; limit?: string };

    const user = request.user!;
    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN" ? barbershopId : user.barbershopId;

    if (!resolvedBarbershopId) {
      throw new AppError(
        "barbershopId é obrigatório ou o usuário deve pertencer a uma barbearia",
        400
      );
    }

    const useCase = container.resolve(ListPaymentsUseCase);
    const result = await useCase.execute(
      resolvedBarbershopId,
      Number(page),
      Math.min(Number(limit), 100)
    );

    reply.send({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit)
      }
    });
  }
}
