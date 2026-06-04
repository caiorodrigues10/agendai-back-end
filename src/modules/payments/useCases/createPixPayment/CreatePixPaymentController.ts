import { FastifyRequest, FastifyReply } from "fastify";
import { CreatePixPaymentUseCase } from "./CreatePixPaymentUseCase";
import { createPixPaymentSchema } from "../../schemas/paymentSchemas";

export class CreatePixPaymentController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const data = createPixPaymentSchema.parse(request.body);

    const useCase = new CreatePixPaymentUseCase();
    const payment = await useCase.execute(data);

    reply.status(201).send({ success: true, data: payment });
  }
}