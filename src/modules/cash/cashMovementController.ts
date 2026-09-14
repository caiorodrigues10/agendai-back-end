import { FastifyRequest, FastifyReply } from "fastify";
import { createCashMovementSchema, cashMovementQuerySchema, cashSummaryQuerySchema } from "./cashMovementSchema";
import { CashMovementUseCases } from "./cashMovementUseCases";
import { AppError } from "@/shared/errors/AppError";

export class CashMovementController {
  private useCases = new CashMovementUseCases();

  async registerMovement(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = createCashMovementSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? (body as any).barbershopId ?? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) {
      throw new AppError("barbershopId is required", 400);
    }

    if (user.role !== "MASTER_ADMIN" && resolvedBarbershopId !== user.barbershopId) {
      throw new AppError("Access denied", 403);
    }

    const movement = await this.useCases.registerMovement(
      resolvedBarbershopId,
      user.id,
      {
        barbershopId: resolvedBarbershopId,
        type: body.type,
        amount: body.amount,
        paymentMethod: body.paymentMethod,
        description: body.description,
        sourceType: body.sourceType,
        sourceId: body.sourceId,
        idempotencyKey: body.idempotencyKey,
        createdBy: user.id,
      }
    );

    reply.status(201).send({ success: true, data: movement });
  }

  async listMovements(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const query = cashMovementQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.query as any).barbershopId ?? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) {
      throw new AppError("barbershopId is required", 400);
    }

    const movements = await this.useCases.listMovements(resolvedBarbershopId, {
      date: query.date,
      paymentMethod: query.paymentMethod,
      type: query.type,
    });

    reply.send({ success: true, data: movements });
  }

  async getDailySummary(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const { date } = cashSummaryQuerySchema.parse(request.query);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? (request.query as any).barbershopId ?? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) {
      throw new AppError("barbershopId is required", 400);
    }

    const summary = await this.useCases.getDailySummary(resolvedBarbershopId, date);

    reply.send({ success: true, data: summary });
  }
}
