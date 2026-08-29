import { FastifyRequest, FastifyReply } from "fastify";
import { container } from "tsyringe";
import { z } from "zod";
import { CheckInAppointmentUseCase } from "./CheckInAppointmentUseCase";
import { AppError } from "@/shared/errors/AppError";

const checkInSchema = z.object({
  params: z.object({
    id: z.string().uuid("ID de agendamento inválido"),
  }),
});

export class CheckInAppointmentController {
  async handle(request: FastifyRequest, reply: FastifyReply) {
    const parsed = checkInSchema.safeParse(request);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0].message, 400);
    }

    const { id: appointmentId } = parsed.data.params;
    const user = request.user as { id: string; barbershopId?: string; role: string };

    if (!user.barbershopId) {
      throw new AppError("Acesso negado: barbershop não identificada", 403);
    }

    const useCase = container.resolve(CheckInAppointmentUseCase);
    const result = await useCase.execute({
      appointmentId,
      barbershopId: user.barbershopId,
      userId: user.id,
      userRole: user.role,
    });

    return reply.status(201).send(result);
  }
}
