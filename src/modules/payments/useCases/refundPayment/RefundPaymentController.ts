import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { z } from "zod";
import { RefundPaymentUseCase } from "./RefundPaymentUseCase";
import { AppError } from "@/shared/errors/AppError";

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
    const rawKey = request.headers["idempotency-key"];
    const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 100) {
      throw new AppError("Idempotency-Key obrigatório e inválido", 400);
    }

    const useCase = container.resolve(RefundPaymentUseCase);
    const refund = await useCase.execute(id, body.reason, {
      id: user.id,
      role: user.role,
    }, idempotencyKey);

    reply.send({ success: true, data: refund });
  }
}
