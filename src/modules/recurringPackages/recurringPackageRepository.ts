import { prisma } from "@/libs/prismaClient";
import { Prisma } from "@prisma/client";

export interface CreatePlanData {
  barbershopId?: string;
  name: string;
  description?: string | null;
  price: number;
  billingCycle: string;
  maxMembers?: number;
  benefits?: Array<{
    name: string;
    type: string;
    value: number;
    serviceId?: string | null;
    maxUsesPerCycle?: number | null;
  }>;
}

export interface UpdatePlanData {
  name?: string;
  description?: string | null;
  price?: number;
  billingCycle?: string;
  maxMembers?: number;
  active?: boolean;
  benefits?: Array<{
    id?: string;
    name: string;
    type: string;
    value: number;
    serviceId?: string | null;
    maxUsesPerCycle?: number | null;
  }>;
}

export interface CreatePackageData {
  barbershopId?: string;
  planId: string;
  clientId: string;
}

export interface RecordPaymentData {
  paymentMethod: string;
  amount?: number;
  notes?: string;
  idempotencyKey?: string;
}

export interface RecurringPackageListFilters {
  status?: string;
  clientId?: string;
  planId?: string;
  page?: number;
  limit?: number;
}

export class RecurringPackageRepository {
  // ── Plans ──────────────────────────────────────────

  async createPlan(data: CreatePlanData) {
    return prisma.salonRecurringPackagePlan.create({
      data: {
        barbershopId: data.barbershopId,
        name: data.name,
        description: data.description ?? null,
        price: new Prisma.Decimal(data.price),
        billingCycle: data.billingCycle as any,
        maxMembers: data.maxMembers ?? 0,
        isActive: true,
        benefits: data.benefits
          ? {
              create: data.benefits.map((b) => ({
                type: b.type,
                quantity: b.maxUsesPerCycle ?? 1,
                discountPercent: b.type === "DISCOUNT_PERCENT" ? b.value : null,
                discountAmount: b.type === "DISCOUNT_AMOUNT" ? new Prisma.Decimal(b.value) : null,
                description: b.name,
                serviceId: b.serviceId ?? null,
              })),
            }
          : undefined,
      },
      include: { benefits: true },
    });
  }

  async updatePlan(id: string, data: UpdatePlanData) {
    const { benefits, ...planData } = data;

    const updateData: any = { ...planData };
    if (planData.price !== undefined) {
      updateData.price = new Prisma.Decimal(planData.price);
    }
    if (planData.active !== undefined) {
      updateData.isActive = planData.active;
    }

    if (benefits) {
      const existingBenefits = await prisma.recurringPackageBenefit.findMany({
        where: { planId: id },
      });

      const existingIds = benefits.filter((b: { id?: string }) => b.id).map((b: { id?: string }) => b.id!);
      const toDelete = existingBenefits.filter((b: { id: string }) => !existingIds.includes(b.id));

      await prisma.recurringPackageBenefit.deleteMany({
        where: { id: { in: toDelete.map((b: { id: string }) => b.id) } },
      });

      for (const benefit of benefits) {
        const benefitData: any = {
          type: benefit.type,
          quantity: benefit.maxUsesPerCycle ?? 1,
          discountPercent: benefit.type === "DISCOUNT_PERCENT" ? benefit.value : null,
          discountAmount: benefit.type === "DISCOUNT_AMOUNT" ? new Prisma.Decimal(benefit.value) : null,
          description: benefit.name,
          serviceId: benefit.serviceId ?? null,
        };

        if (benefit.id) {
          await prisma.recurringPackageBenefit.update({
            where: { id: benefit.id },
            data: benefitData,
          });
        } else {
          await prisma.recurringPackageBenefit.create({
            data: { ...benefitData, planId: id },
          });
        }
      }
    }

    return prisma.salonRecurringPackagePlan.update({
      where: { id },
      data: updateData,
      include: { benefits: true },
    });
  }

  async getPlan(id: string) {
    return prisma.salonRecurringPackagePlan.findUnique({
      where: { id },
      include: { benefits: true },
    });
  }

  async listPlans(barbershopId: string) {
    return prisma.salonRecurringPackagePlan.findMany({
      where: { barbershopId },
      include: { benefits: true },
      orderBy: { createdAt: "desc" },
    });
  }

  // ── Packages (Client Recurring Packages) ──────────

  async createPackage(data: CreatePackageData) {
    const plan = await prisma.salonRecurringPackagePlan.findUnique({
      where: { id: data.planId },
    });
    if (!plan) throw new Error("Plan not found");

    const now = new Date();
    let cycleEnd = new Date(now);
    switch (plan.billingCycle) {
      case "MONTHLY":
        cycleEnd.setMonth(cycleEnd.getMonth() + 1);
        break;
      case "QUARTERLY":
        cycleEnd.setMonth(cycleEnd.getMonth() + 3);
        break;
      case "YEARLY":
        cycleEnd.setFullYear(cycleEnd.getFullYear() + 1);
        break;
    }

    const dueDate = new Date(now);

    return prisma.clientRecurringPackage.create({
      data: {
        barbershopId: data.barbershopId,
        planId: data.planId,
        clientId: data.clientId,
        status: "PENDING",
        startDate: now,
        currentPeriodEnd: cycleEnd,
        cycles: {
          create: {
            periodStart: now,
            periodEnd: cycleEnd,
            dueDate,
            amount: plan.price,
            status: "PENDING",
          },
        },
      },
      include: { plan: true, cycles: true },
    });
  }

  async getPackage(id: string) {
    return prisma.clientRecurringPackage.findUnique({
      where: { id },
      include: {
        plan: { include: { benefits: true } },
        cycles: { orderBy: { periodStart: "desc" } },
        usages: { orderBy: { usedAt: "desc" } },
        client: { select: { id: true, name: true, whatsapp: true } },
      },
    });
  }

  async listPackages(barbershopId: string, filters: RecurringPackageListFilters) {
    const where: Prisma.ClientRecurringPackageWhereInput = { barbershopId };

    if (filters.status) where.status = filters.status as any;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.planId) where.planId = filters.planId;

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.clientRecurringPackage.findMany({
        where,
        include: {
          plan: { select: { id: true, name: true, price: true } },
          client: { select: { id: true, name: true, whatsapp: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.clientRecurringPackage.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async activatePackage(id: string) {
    return prisma.clientRecurringPackage.update({
      where: { id },
      data: { status: "ACTIVE", startDate: new Date() },
    });
  }

  async pausePackage(id: string) {
    return prisma.clientRecurringPackage.update({
      where: { id },
      data: { status: "PAUSED", pauseDate: new Date() },
    });
  }

  async resumePackage(id: string) {
    return prisma.clientRecurringPackage.update({
      where: { id },
      data: { status: "ACTIVE", resumeDate: new Date() },
    });
  }

  async cancelPackage(id: string) {
    return prisma.clientRecurringPackage.update({
      where: { id },
      data: { status: "CANCELED", cancelDate: new Date() },
    });
  }

  // ── Cycles ─────────────────────────────────────────

  async createCycle(data: {
    packageId: string;
    periodStart: Date;
    periodEnd: Date;
    dueDate: Date;
    amount: number;
  }) {
    return prisma.recurringPackageCycle.create({
      data: {
        packageId: data.packageId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        dueDate: data.dueDate,
        amount: new Prisma.Decimal(data.amount),
        status: "PENDING",
      },
    });
  }

  async payCycle(cycleId: string, data: RecordPaymentData) {
    return prisma.recurringPackageCycle.update({
      where: { id: cycleId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentMethod: data.paymentMethod,
        idempotencyKey: data.idempotencyKey ?? null,
      },
    });
  }

  async listCycles(packageId: string) {
    return prisma.recurringPackageCycle.findMany({
      where: { packageId },
      orderBy: { periodStart: "desc" },
    });
  }

  async getOverdueCycles(barbershopId: string) {
    const now = new Date();
    return prisma.recurringPackageCycle.findMany({
      where: {
        status: "PENDING",
        dueDate: { lt: now },
        package_: {
          barbershopId,
        },
      },
      include: {
        package_: {
          include: {
            plan: { select: { id: true, name: true } },
            client: { select: { id: true, name: true, whatsapp: true } },
          },
        },
      },
    });
  }

  // ── Benefits ───────────────────────────────────────

  async useBenefit(
    packageId: string,
    benefitId: string,
    appointmentId: string,
    idempotencyKey?: string
  ) {
    if (idempotencyKey) {
      const existing = await prisma.recurringPackageUsage.findFirst({
        where: { idempotencyKey },
      });
      if (existing) return existing;
    }

    return prisma.recurringPackageUsage.create({
      data: {
        packageId,
        benefitId,
        appointmentId,
        idempotencyKey: idempotencyKey ?? null,
      },
    });
  }

  async reverseBenefit(usageId: string) {
    return prisma.recurringPackageUsage.delete({
      where: { id: usageId },
    });
  }

  async getBenefitUsage(packageId: string, benefitId: string) {
    const benefit = await prisma.recurringPackageBenefit.findUnique({
      where: { id: benefitId },
    });

    const usedCount = await prisma.recurringPackageUsage.count({
      where: {
        packageId,
        benefitId,
      },
    });

    return {
      benefit,
      usedCount,
      maxUses: benefit?.quantity ?? null,
      remaining: benefit?.quantity != null ? benefit.quantity - usedCount : null,
    };
  }
}
