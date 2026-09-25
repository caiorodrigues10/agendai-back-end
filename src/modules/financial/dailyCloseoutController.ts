import { FastifyRequest, FastifyReply } from "fastify";
import { createCloseoutSchema, closeoutQuerySchema } from "./dailyCloseoutSchema";
import { DailyCloseoutUseCases } from "./dailyCloseoutUseCases";
import { AppError } from "@/shared/errors/AppError";

export class DailyCloseoutController {
  private useCases = new DailyCloseoutUseCases();

  async closeDay(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = createCloseoutSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? body.barbershopId ?? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) {
      throw new AppError("barbershopId is required", 400);
    }

    if (user.role !== "MASTER_ADMIN" && resolvedBarbershopId !== user.barbershopId) {
      throw new AppError("Access denied", 403);
    }

    const closeout = await this.useCases.closeDay(
      resolvedBarbershopId,
      body.date,
      user.id,
      {
        balanceOpen: body.balanceOpen,
        cashReceived: body.cashReceived,
        pixReceived: body.pixReceived,
        cardReceived: body.cardReceived,
        discrepancy: body.discrepancy,
        notes: body.notes,
      }
    );

    reply.status(201).send({ success: true, data: closeout });
  }

  async getCloseout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const { date } = closeoutQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.query as any).barbershopId ?? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) {
      throw new AppError("barbershopId is required", 400);
    }

    if (user.role !== "MASTER_ADMIN" && resolvedBarbershopId !== user.barbershopId) {
      throw new AppError("Access denied", 403);
    }

    const closeout = await this.useCases.getCloseout(resolvedBarbershopId, date);

    reply.send({ success: true, data: closeout });
  }
}
