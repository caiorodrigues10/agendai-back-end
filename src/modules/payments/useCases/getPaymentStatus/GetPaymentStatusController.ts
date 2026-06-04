import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { GetPaymentStatusUseCase } from "./GetPaymentStatusUseCase";

export class GetPaymentStatusController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const { sync } = request.query as { sync?: string };
    const useCase = container.resolve(GetPaymentStatusUseCase);
    // IMP-4: passa o logger do Fastify para rastreabilidade
    const payment = await useCase.execute(id, sync === "true", request.log);
    reply.send({ success: true, data: payment });
  }
}
