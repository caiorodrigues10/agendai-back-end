import { FastifyRequest, FastifyReply } from "fastify";
import {
  createPricingRuleSchema,
  updatePricingRuleSchema,
  evaluatePriceSchema,
} from "./pricingSchema";
import { PricingUseCases } from "./pricingUseCases";
import { AppError } from "@/shared/errors/AppError";

export class PricingController {
  private useCases = new PricingUseCases();

  async listRules(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const rules = await this.useCases.listRules(resolvedBarbershopId);
    reply.send({ success: true, data: rules });
  }

  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = createPricingRuleSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const rule = await this.useCases.create(resolvedBarbershopId, body);
    reply.status(201).send({ success: true, data: rule });
  }

  async update(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };
    const body = updatePricingRuleSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const rule = await this.useCases.update(id, resolvedBarbershopId, body);
    reply.send({ success: true, data: rule });
  }

  async toggleActive(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const rule = await this.useCases.toggleActive(id, resolvedBarbershopId);
    reply.send({ success: true, data: rule });
  }

  async delete(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId, id } = request.params as { barbershopId: string; id: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    await this.useCases.delete(id, resolvedBarbershopId);
    reply.send({ success: true, message: "Regra de precificação removida" });
  }

  async evaluatePrice(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };
    const body = evaluatePriceSchema.parse(request.body);

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const result = await this.useCases.evaluatePrice(resolvedBarbershopId, body);
    reply.send({ success: true, data: result });
  }
}
