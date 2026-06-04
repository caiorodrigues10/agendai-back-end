import { FastifyRequest, FastifyReply } from "fastify";
import { CreateCardPaymentUseCase } from "./CreateCardPaymentUseCase";
import { createCardPaymentSchema } from "../../schemas/paymentSchemas";

export class CreateCardPaymentController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const data = createCardPaymentSchema.parse(request.body);

    const useCase = new CreateCardPaymentUseCase();
    const payment = await useCase.execute(data);

    reply.status(201).send({ success: true, data: payment });
  }
}