import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { z } from "zod";
import { CompleteServiceUseCase } from "./CompleteServiceUseCase";
import { AppError } from "@/shared/errors/AppError";

const completeServiceSchema = z.object({
  finalPrice: z.number().min(0).optional(),
  paymentMethod: z.enum(["cash", "pix", "credit_card", "debit_card", "fiado"]).optional(),
  splitWithProfessionalId: z.string().uuid().optional(),
  splitPercentage: z.number().min(1).max(99).optional(),
});

export class CompleteServiceController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user;
    if (!user) throw new AppError("Não autenticado", 401);

    const { id } = request.params as { id: string };
    const body = completeServiceSchema.parse(request.body ?? {});

    const useCase = container.resolve(CompleteServiceUseCase);
    const result = await useCase.execute({
      queueItemId: id,
      barbershopId: user.barbershopId!,
      requestingUserId: user.id,
      requestingUserRole: user.role,
      ...body,
    });

    reply.status(200).send({ success: true, data: result });
  }
}
