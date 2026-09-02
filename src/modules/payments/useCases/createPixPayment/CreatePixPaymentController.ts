import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { CreatePixPaymentUseCase } from "./CreatePixPaymentUseCase";
import { createPixPaymentSchema } from "../../schemas/paymentSchemas";
import { executeIdempotent } from "@/shared/services/idempotencyService";
import { createHash } from "node:crypto";

export class CreatePixPaymentController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const data = createPixPaymentSchema.parse(request.body);
    const useCase = container.resolve(CreatePixPaymentUseCase);
    // IMP-1: passa o usuário autenticado para autorização no UseCase
    const execution = await executeIdempotent(request, `pix:${data.barbershopId}`, async () => {
      const reference = data.externalReference ?? `ag-idem-${createHash("sha256").update(`${request.user!.id}:${request.idempotencyKey}`).digest("hex").slice(0, 32)}`;
      return useCase.execute({ ...data, externalReference: reference }, request.user);
    });
    reply.status(execution.replayed ? 200 : 201).send({ success: true, data: execution.data, replayed: execution.replayed });
  }
}
