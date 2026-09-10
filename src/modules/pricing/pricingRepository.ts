import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  createPricingRuleSchema,
  updatePricingRuleSchema,
  pricingRuleTypeMap,
} from "./pricingSchema";
import type { z } from "zod";

type CreateInput = z.infer<typeof createPricingRuleSchema>;
type UpdateInput = z.infer<typeof updatePricingRuleSchema>;

const ruleSelect = {
  id: true,
  barbershopId: true,
  name: true,
  type: true,
  isActive: true,
  priority: true,
  config: true,
  discountPercent: true,
  surchargePercent: true,
  startAt: true,
  endAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class PricingRepository {
  async listByBarbershop(barbershopId: string, activeOnly = false) {
    return prisma.pricingRule.findMany({
      where: {
        barbershopId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      select: ruleSelect,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
  }

  async findById(id: string) {
    return prisma.pricingRule.findUnique({
      where: { id },
      select: ruleSelect,
    });
  }

  async create(barbershopId: string, data: CreateInput) {
    return prisma.pricingRule.create({
      data: {
        barbershopId,
        name: data.name,
        type: pricingRuleTypeMap[data.type],
        isActive: data.isActive,
        priority: data.priority,
        config: data.config ?? {},
        discountPercent: data.discountPercent,
        surchargePercent: data.surchargePercent,
        startAt: data.startAt ? new Date(data.startAt) : null,
        endAt: data.endAt ? new Date(data.endAt) : null,
      },
      select: ruleSelect,
    });
  }

  async update(id: string, data: UpdateInput) {
    const existing = await prisma.pricingRule.findUnique({ where: { id } });
    if (!existing) throw new AppError("Regra de precificação não encontrada", 404);

    return prisma.pricingRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: pricingRuleTypeMap[data.type] }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.config !== undefined && { config: data.config }),
        ...(data.discountPercent !== undefined && { discountPercent: data.discountPercent }),
        ...(data.surchargePercent !== undefined && { surchargePercent: data.surchargePercent }),
        ...(data.startAt !== undefined && { startAt: data.startAt ? new Date(data.startAt) : null }),
        ...(data.endAt !== undefined && { endAt: data.endAt ? new Date(data.endAt) : null }),
      },
      select: ruleSelect,
    });
  }

  async toggleActive(id: string) {
    const existing = await prisma.pricingRule.findUnique({ where: { id } });
    if (!existing) throw new AppError("Regra de precificação não encontrada", 404);

    return prisma.pricingRule.update({
      where: { id },
      data: { isActive: !existing.isActive },
      select: ruleSelect,
    });
  }

  async delete(id: string) {
    const existing = await prisma.pricingRule.findUnique({ where: { id } });
    if (!existing) throw new AppError("Regra de precificação não encontrada", 404);

    await prisma.pricingRule.delete({ where: { id } });
  }
}
