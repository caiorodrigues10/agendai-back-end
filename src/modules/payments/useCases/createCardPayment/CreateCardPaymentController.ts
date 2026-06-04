import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { CreateCardPaymentUseCase } from "./CreateCardPaymentUseCase";
import { createCardPaymentSchema } from "../../schemas/paymentSchemas";

export class CreateCardPaymentController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const data = createCardPaymentSchema.parse(request.body);
    const useCase = container.resolve(CreateCardPaymentUseCase);
    // IMP-1: passa o usuário autenticado para autorização no UseCase
    const payment = await useCase.execute(data, request.user);
    reply.status(201).send({ success: true, data: payment });
  }
}
