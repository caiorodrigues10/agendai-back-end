import { PricingRepository } from "./pricingRepository";
import { AppError } from "@/shared/errors/AppError";
import { prisma } from "@/libs/prismaClient";
import type { z } from "zod";
import type {
  createPricingRuleSchema,
  updatePricingRuleSchema,
  evaluatePriceSchema,
} from "./pricingSchema";

type CreateInput = z.infer<typeof createPricingRuleSchema>;
type UpdateInput = z.infer<typeof updatePricingRuleSchema>;
type EvaluateInput = z.infer<typeof evaluatePriceSchema>;

interface PriceAdjustment {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  discountPercent: number;
  surchargePercent: number;
}

interface EvaluationResult {
  basePrice: number;
  finalPrice: number;
  adjustments: PriceAdjustment[];
  totalDiscount: number;
  totalSurcharge: number;
}

export class PricingUseCases {
  private repo = new PricingRepository();

  async listRules(barbershopId: string, activeOnly = false) {
    return this.repo.listByBarbershop(barbershopId, activeOnly);
  }

  async getById(id: string) {
    const rule = await this.repo.findById(id);
    if (!rule) throw new AppError("Regra de precificação não encontrada", 404);
    return rule;
  }

  async create(barbershopId: string, data: CreateInput) {
    return this.repo.create(barbershopId, data);
  }

  async update(id: string, barbershopId: string, data: UpdateInput) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Regra de precificação não encontrada", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.update(id, data);
  }

  async toggleActive(id: string, barbershopId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Regra de precificação não encontrada", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.toggleActive(id);
  }

  async delete(id: string, barbershopId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Regra de precificação não encontrada", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.delete(id);
  }

  async evaluatePrice(barbershopId: string, input: EvaluateInput): Promise<EvaluationResult> {
    const rules = await this.repo.listByBarbershop(barbershopId, true);
    const now = input.scheduledAt ? new Date(input.scheduledAt) : new Date();

    const adjustments: PriceAdjustment[] = [];

    for (const rule of rules) {
      if (await this.isRuleApplicable(rule, now, input)) {
        adjustments.push({
          ruleId: rule.id,
          ruleName: rule.name,
          ruleType: rule.type,
          discountPercent: rule.discountPercent,
          surchargePercent: rule.surchargePercent,
        });
      }
    }

    const totalDiscount = adjustments.reduce((sum, a) => sum + a.discountPercent, 0);
    const totalSurcharge = adjustments.reduce((sum, a) => sum + a.surchargePercent, 0);
    const netPercent = totalSurcharge - totalDiscount;
    const finalPrice = Math.max(0, input.basePrice * (1 + netPercent / 100));

    return {
      basePrice: input.basePrice,
      finalPrice: Math.round(finalPrice * 100) / 100,
      adjustments,
      totalDiscount,
      totalSurcharge,
    };
  }

  private async isRuleApplicable(
    rule: { type: string; config: any; startAt: Date | null; endAt: Date | null },
    now: Date,
    input: EvaluateInput,
  ): Promise<boolean> {
    if (rule.startAt && now < rule.startAt) return false;
    if (rule.endAt && now > rule.endAt) return false;

    const config = (rule.config as Record<string, any>) ?? {};

    switch (rule.type) {
      case "PEAK_HOURS": {
        const hours = config.hours as number[] | undefined;
        if (hours && hours.length > 0) {
          return hours.includes(now.getHours());
        }
        return true;
      }
      case "HAPPY_HOUR": {
        const startHour = config.startHour as number | undefined;
        const endHour = config.endHour as number | undefined;
        if (startHour !== undefined && endHour !== undefined) {
          const h = now.getHours();
          return startHour <= endHour
            ? h >= startHour && h < endHour
            : h >= startHour || h < endHour;
        }
        return true;
      }
      case "DAY_OF_WEEK": {
        const days = config.days as number[] | undefined;
        if (days && days.length > 0) {
          return days.includes(now.getDay());
        }
        return true;
      }
      case "LOYALTY_DISCOUNT": {
        if (!input.clientId) return false;
        const minVisits = (config.minVisits as number) ?? 5;
        return await this.checkClientLoyalty(input.clientId, minVisits);
      }
      case "FIRST_VISIT": {
        if (!input.clientId) return false;
        return await this.checkFirstVisit(input.clientId);
      }
      case "WEATHER_BASED": {
        const conditions = config.conditions as string[] | undefined;
        if (conditions && conditions.length > 0 && input.weatherCondition) {
          return conditions.includes(input.weatherCondition);
        }
        return false;
      }
      case "SEASONAL":
      case "CUSTOM":
      default:
        return true;
    }
  }

  private async checkClientLoyalty(clientId: string, minVisits: number): Promise<boolean> {
    const count = await prisma.appointment.count({
      where: {
        clientId,
        status: { in: ["CONFIRMED", "COMPLETED"] },
      },
    });
    return count >= minVisits;
  }

  private async checkFirstVisit(clientId: string): Promise<boolean> {
    const count = await prisma.appointment.count({
      where: {
        clientId,
        status: { in: ["CONFIRMED", "COMPLETED"] },
      },
    });
    return count === 0;
  }
}
