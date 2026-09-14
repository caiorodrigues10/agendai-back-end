import { FastifyRequest, FastifyReply } from "fastify";
import {
  configureLoyaltyProgramSchema,
  recordVisitSchema,
  redeemRewardSchema,
  adjustManualSchema,
  recordCashbackSchema,
  redeemCashbackSchema,
} from "./loyaltyProgramSchema";
import { LoyaltyUseCases } from "./loyaltyUseCases";
import { AppError } from "@/shared/errors/AppError";

export class LoyaltyController {
  private useCases = new LoyaltyUseCases();

  async configureProgram(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = configureLoyaltyProgramSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? (body as any).barbershopId ?? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);
    if (user.role !== "MASTER_ADMIN" && resolvedBarbershopId !== user.barbershopId) {
      throw new AppError("Access denied", 403);
    }

    const program = await this.useCases.configureProgram(resolvedBarbershopId, {
      type: body.type,
      isActive: body.isActive,
      config: body.config,
    });

    reply.send({ success: true, data: program });
  }

  async getProgram(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);
    if (user.role !== "MASTER_ADMIN" && resolvedBarbershopId !== user.barbershopId) {
      throw new AppError("Access denied", 403);
    }

    const program = await this.useCases.getProgram(resolvedBarbershopId);

    reply.send({
      success: true,
      data: program ?? {
        id: null,
        barbershopId: resolvedBarbershopId,
        type: "VISITS",
        isActive: false,
        config: {
          visitsRequired: 5,
          rewardDescription: "",
          cashbackEnabled: false,
          cashbackPercent: 0,
        },
      },
    });
  }

  async getAccount(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, clientId } = request.params as { barbershopId: string; clientId: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const data = await this.useCases.getAccount(resolvedBarbershopId, clientId);

    reply.send({ success: true, data });
  }

  async getBalance(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, clientId } = request.params as { barbershopId: string; clientId: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const data = await this.useCases.getBalance(resolvedBarbershopId, clientId);

    reply.send({ success: true, data });
  }

  async recordVisit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = recordVisitSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const data = await this.useCases.recordVisit(resolvedBarbershopId, body.clientId, body.idempotencyKey);

    reply.status(201).send({ success: true, data });
  }

  async redeemReward(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = redeemRewardSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const data = await this.useCases.redeemReward(
      resolvedBarbershopId,
      body.clientId,
      body.description,
      body.idempotencyKey
    );

    reply.status(201).send({ success: true, data });
  }

  async adjustManual(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = adjustManualSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const data = await this.useCases.adjustManual(
      resolvedBarbershopId,
      body.clientId,
      body.delta,
      body.description,
      body.idempotencyKey
    );

    reply.status(201).send({ success: true, data });
  }

  async recordCashback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = recordCashbackSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const data = await this.useCases.recordCashback(
      resolvedBarbershopId,
      body.clientId,
      body.appointmentId,
      body.paymentAmount,
      body.idempotencyKey
    );

    reply.status(201).send({ success: true, data });
  }

  async redeemCashback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = redeemCashbackSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const data = await this.useCases.redeemCashback(
      resolvedBarbershopId,
      body.clientId,
      body.amount,
      body.idempotencyKey
    );

    reply.status(201).send({ success: true, data });
  }
}
