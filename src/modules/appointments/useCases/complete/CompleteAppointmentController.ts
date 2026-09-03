import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { z } from "zod";
import { CompleteAppointmentUseCase } from "./CompleteAppointmentUseCase";
import { retailSalePayloadSchema } from "@/modules/products/schemas/productSchemas";

const completeAppointmentSchema = z.object({
  finalPrice: z.number().min(0).optional(),
  paymentMethod: z.enum(["pix", "credit_card", "fiado", "cash", "debit_card"]).optional(),
  commissionSplits: z.array(z.object({
    professionalId: z.string().uuid(),
    percentage: z.number().min(0).max(100),
  })).optional(),
  retailSale: retailSalePayloadSchema.optional(),
});

export class CompleteAppointmentController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = completeAppointmentSchema.parse(request.body);

    const barbershopId = user.role === "MASTER_ADMIN"
      ? (body as any).barbershopId ?? user.barbershopId
      : user.barbershopId;

    if (!barbershopId) throw new Error("barbershopId é obrigatório");

    const useCase = container.resolve(CompleteAppointmentUseCase);
    const appointment = await useCase.execute({
      appointmentId: id,
      userId: user.id,
      userRole: user.role,
      barbershopId,
      finalPrice: body.finalPrice,
      paymentMethod: body.paymentMethod,
      commissionSplits: body.commissionSplits,
      retailSale: body.retailSale,
    });

    reply.send({ success: true, data: appointment });
  }
}
