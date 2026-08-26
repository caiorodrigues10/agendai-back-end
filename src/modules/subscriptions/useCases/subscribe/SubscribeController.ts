import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { subscribeSchema } from "../../schemas/subscriptionSchemas";
import { SubscribeUseCase } from "./SubscribeUseCase";
import { AppError } from "@/shared/errors/AppError";

export class SubscribeController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;

    if (user.role === "EMPLOYEE") {
      throw new AppError("Apenas proprietários podem assinar planos", 403);
    }

    const body = subscribeSchema.parse(request.body);

    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? body.barbershopId
        : user.barbershopId;

    if (!barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    const useCase = container.resolve(SubscribeUseCase);
    const result = await useCase.execute(
      {
        ...body,
        barbershopId,
        remoteIp: request.ip
      },
      user
    );

    reply.status(201).send({ success: true, data: result });
  }
}