import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { z } from "zod";
import { RefundPaymentUseCase } from "./RefundPaymentUseCase";

const refundBodySchema = z.object({
  reason: z
    .string()
    .min(3, "Motivo deve ter pelo menos 3 caracteres")
    .max(500, "Motivo deve ter no máximo 500 caracteres"),
});

export class RefundPaymentController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const user = request.user!;
    const body = refundBodySchema.parse(request.body);

    const useCase = container.resolve(RefundPaymentUseCase);
    const refund = await useCase.execute(id, body.reason, {
      id: user.id,
      role: user.role,
    });

    reply.send({ success: true, data: refund });
  }
}