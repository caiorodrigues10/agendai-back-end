import { FastifyRequest, FastifyReply } from "fastify";
import { CancellationContextUseCase } from "./CancellationContextUseCase";
import { AppError } from "@/shared/errors/AppError";

export class CancellationContextController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;

    if (user.role === "EMPLOYEE") {
      throw new AppError("Apenas proprietários podem visualizar este contexto", 403);
    }

    const { barbershopId } = request.query as { barbershopId?: string };

    if (user.role === "MASTER_ADMIN" && !barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = new CancellationContextUseCase();
    const data = await useCase.execute(user, barbershopId);

    reply.send({ success: true, data });
  }
}