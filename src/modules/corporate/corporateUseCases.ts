import { CorporateRepository } from "./corporateRepository";
import { AppError } from "@/shared/errors/AppError";
import type { z } from "zod";
import type { createCorporatePlanSchema, updateCorporatePlanSchema, subscribeBarbershopSchema } from "./corporateSchema";

type CreatePlanInput = z.infer<typeof createCorporatePlanSchema>;
type UpdatePlanInput = z.infer<typeof updateCorporatePlanSchema>;
type SubscribeInput = z.infer<typeof subscribeBarbershopSchema>;

export class CorporateUseCases {
  private repo = new CorporateRepository();

  async listPlans() {
    return this.repo.listPlans();
  }

  async getPlanById(id: string) {
    const plan = await this.repo.findPlanById(id);
    if (!plan) throw new AppError("Plano corporativo não encontrado", 404);
    return plan;
  }

  async createPlan(data: CreatePlanInput) {
    return this.repo.createPlan(data);
  }

  async updatePlan(id: string, data: UpdatePlanInput) {
    return this.repo.updatePlan(id, data);
  }

  async deletePlan(id: string) {
    return this.repo.deletePlan(id);
  }

  async listSubscriptions(planId: string) {
    await this.getPlanById(planId);
    return this.repo.listSubscriptions(planId);
  }

  async subscribe(planId: string, data: SubscribeInput) {
    return this.repo.subscribe(planId, data.barbershopId);
  }

  async validateSubscription(barbershopId: string) {
    const subscription = await this.repo.validateSubscription(barbershopId);

    if (!subscription) {
      return { active: false, subscription: null };
    }

    const plan = subscription.plan as { expiresAt: Date | null } | null;
    if (plan?.expiresAt && new Date(plan.expiresAt) < new Date()) {
      return { active: false, subscription };
    }

    if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
      return { active: false, subscription };
    }

    return { active: true, subscription };
  }
}
