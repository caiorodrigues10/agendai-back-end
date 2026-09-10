import { FastifyRequest, FastifyReply } from "fastify";
import {
  createCorporatePlanSchema,
  updateCorporatePlanSchema,
  subscribeBarbershopSchema,
} from "./corporateSchema";
import { CorporateUseCases } from "./corporateUseCases";
import { AppError } from "@/shared/errors/AppError";

export class CorporateController {
  private useCases = new CorporateUseCases();

  async listPlans(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const plans = await this.useCases.listPlans();
    reply.send({ success: true, data: plans });
  }

  async getPlan(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const plan = await this.useCases.getPlanById(id);
    reply.send({ success: true, data: plan });
  }

  async createPlan(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const body = createCorporatePlanSchema.parse(request.body);
    const plan = await this.useCases.createPlan(body);
    reply.status(201).send({ success: true, data: plan });
  }

  async updatePlan(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const body = updateCorporatePlanSchema.parse(request.body);
    const plan = await this.useCases.updatePlan(id, body);
    reply.send({ success: true, data: plan });
  }

  async deletePlan(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    await this.useCases.deletePlan(id);
    reply.send({ success: true, message: "Plano corporativo removido" });
  }

  async listSubscriptions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const subscriptions = await this.useCases.listSubscriptions(id);
    reply.send({ success: true, data: subscriptions });
  }

  async subscribe(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id } = request.params as { id: string };
    const body = subscribeBarbershopSchema.parse(request.body);
    const subscription = await this.useCases.subscribe(id, body);
    reply.status(201).send({ success: true, data: subscription });
  }

  async validateSubscription(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;
    const { barbershopId } = request.params as { barbershopId: string };

    const resolvedBarbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopId
        : user.barbershopId ?? barbershopId;

    if (!resolvedBarbershopId) throw new AppError("barbershopId is required", 400);

    const result = await this.useCases.validateSubscription(resolvedBarbershopId);
    reply.send({ success: true, data: result });
  }
}
