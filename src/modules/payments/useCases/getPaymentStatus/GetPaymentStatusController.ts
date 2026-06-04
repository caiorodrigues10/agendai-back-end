import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { GetPaymentStatusUseCase } from "./GetPaymentStatusUseCase";

export class GetPaymentStatusController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const { sync } = request.query as { sync?: string };
    const useCase = container.resolve(GetPaymentStatusUseCase);
    const payment = await useCase.execute(id, sync === "true");
    reply.send({ success: true, data: payment });
  }
}
