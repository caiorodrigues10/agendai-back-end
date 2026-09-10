import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  createCorporatePlanSchema,
  updateCorporatePlanSchema,
  corporatePlanStatusMap,
  billingCycleMap,
} from "./corporateSchema";
import type { z } from "zod";

type CreatePlanInput = z.infer<typeof createCorporatePlanSchema>;
type UpdatePlanInput = z.infer<typeof updateCorporatePlanSchema>;

const planSelect = {
  id: true,
  name: true,
  companyName: true,
  cnpj: true,
  contactEmail: true,
  contactPhone: true,
  maxUnits: true,
  pricePerUnit: true,
  billingCycle: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { subscriptions: true } },
} as const;

const subscriptionSelect = {
  id: true,
  planId: true,
  barbershopId: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  createdAt: true,
  plan: { select: { id: true, name: true, companyName: true } },
  barbershop: { select: { id: true, name: true } },
} as const;

export class CorporateRepository {
  async listPlans() {
    return prisma.corporatePlan.findMany({
      select: planSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async findPlanById(id: string) {
    return prisma.corporatePlan.findUnique({
      where: { id },
      select: planSelect,
    });
  }

  async createPlan(data: CreatePlanInput) {
    return prisma.corporatePlan.create({
      data: {
        name: data.name,
        companyName: data.companyName,
        cnpj: data.cnpj ?? null,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone ?? null,
        maxUnits: data.maxUnits,
        pricePerUnit: data.pricePerUnit,
        billingCycle: billingCycleMap[data.billingCycle],
      },
      select: planSelect,
    });
  }

  async updatePlan(id: string, data: UpdatePlanInput) {
    const existing = await prisma.corporatePlan.findUnique({ where: { id } });
    if (!existing) throw new AppError("Plano corporativo não encontrado", 404);

    return prisma.corporatePlan.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.companyName !== undefined && { companyName: data.companyName }),
        ...(data.cnpj !== undefined && { cnpj: data.cnpj }),
        ...(data.contactEmail !== undefined && { contactEmail: data.contactEmail }),
        ...(data.contactPhone !== undefined && { contactPhone: data.contactPhone }),
        ...(data.maxUnits !== undefined && { maxUnits: data.maxUnits }),
        ...(data.pricePerUnit !== undefined && { pricePerUnit: data.pricePerUnit }),
        ...(data.billingCycle !== undefined && {
          billingCycle: billingCycleMap[data.billingCycle],
        }),
        ...(data.status !== undefined && {
          status: corporatePlanStatusMap[data.status],
        }),
        ...(data.startedAt !== undefined && {
          startedAt: data.startedAt ? new Date(data.startedAt) : null,
        }),
        ...(data.expiresAt !== undefined && {
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        }),
      },
      select: planSelect,
    });
  }

  async deletePlan(id: string) {
    const existing = await prisma.corporatePlan.findUnique({ where: { id } });
    if (!existing) throw new AppError("Plano corporativo não encontrado", 404);

    await prisma.corporatePlan.delete({ where: { id } });
  }

  async listSubscriptions(planId: string) {
    return prisma.corporateSubscription.findMany({
      where: { planId },
      select: subscriptionSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async findSubscriptionById(id: string) {
    return prisma.corporateSubscription.findUnique({
      where: { id },
      select: subscriptionSelect,
    });
  }

  async findSubscriptionByPlanAndBarbershop(planId: string, barbershopId: string) {
    return prisma.corporateSubscription.findUnique({
      where: { planId_barbershopId: { planId, barbershopId } },
      select: subscriptionSelect,
    });
  }

  async subscribe(planId: string, barbershopId: string) {
    const plan = await prisma.corporatePlan.findUnique({ where: { id: planId } });
    if (!plan) throw new AppError("Plano corporativo não encontrado", 404);

    if (plan.status !== "ACTIVE") {
      throw new AppError("Plano corporativo não está ativo", 400);
    }

    const existing = await this.findSubscriptionByPlanAndBarbershop(planId, barbershopId);
    if (existing) {
      throw new AppError("Barbearia já possui assinatura neste plano", 409);
    }

    const currentCount = await prisma.corporateSubscription.count({
      where: { planId, status: "ACTIVE" },
    });

    if (currentCount >= plan.maxUnits) {
      throw new AppError("Limite de unidades do plano atingido", 400);
    }

    return prisma.corporateSubscription.create({
      data: { planId, barbershopId },
      select: subscriptionSelect,
    });
  }

  async validateSubscription(barbershopId: string) {
    const subscription = await prisma.corporateSubscription.findFirst({
      where: { barbershopId, status: "ACTIVE" },
      select: {
        ...subscriptionSelect,
        plan: {
          select: {
            id: true,
            name: true,
            companyName: true,
            maxUnits: true,
            billingCycle: true,
            expiresAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return subscription;
  }

  async countActiveSubscriptions(planId: string) {
    return prisma.corporateSubscription.count({
      where: { planId, status: "ACTIVE" },
    });
  }
}
