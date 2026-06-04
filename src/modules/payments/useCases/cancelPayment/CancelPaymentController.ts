import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { CancelPaymentUseCase } from "./CancelPaymentUseCase";

export class CancelPaymentController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const useCase = container.resolve(CancelPaymentUseCase);
    const payment = await useCase.execute(id);
    reply.send({ success: true, data: payment });
  }
}
