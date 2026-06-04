import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { CreatePixPaymentUseCase } from "./CreatePixPaymentUseCase";
import { createPixPaymentSchema } from "../../schemas/paymentSchemas";

export class CreatePixPaymentController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const data = createPixPaymentSchema.parse(request.body);
    const useCase = container.resolve(CreatePixPaymentUseCase);
    // IMP-1: passa o usuário autenticado para autorização no UseCase
    const payment = await useCase.execute(data, request.user);
    reply.status(201).send({ success: true, data: payment });
  }
}
