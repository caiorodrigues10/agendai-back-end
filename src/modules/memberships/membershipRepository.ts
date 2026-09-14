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

export interface CreateMembershipData {
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

export interface MembershipListFilters {
  status?: string;
  clientId?: string;
  planId?: string;
  page?: number;
  limit?: number;
}

export class MembershipRepository {
  // ── Plans ──────────────────────────────────────────

  async createPlan(data: CreatePlanData) {
    return prisma.membershipPlan.create({
      data: {
        barbershopId: data.barbershopId,
        name: data.name,
        description: data.description ?? null,
        price: new Prisma.Decimal(data.price),
        billingCycle: data.billingCycle as any,
        maxMembers: data.maxMembers ?? 0,
        active: true,
        benefits: data.benefits
          ? {
              create: data.benefits.map((b) => ({
                name: b.name,
                type: b.type,
                value: new Prisma.Decimal(b.value),
                serviceId: b.serviceId ?? null,
                maxUsesPerCycle: b.maxUsesPerCycle ?? null,
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

    if (benefits) {
      const existingBenefits = await prisma.membershipBenefit.findMany({
        where: { planId: id },
      });

      const existingIds = benefits.filter((b: { id?: string }) => b.id).map((b: { id?: string }) => b.id!);
      const toDelete = existingBenefits.filter((b: { id: string }) => !existingIds.includes(b.id));

      await prisma.membershipBenefit.deleteMany({
        where: { id: { in: toDelete.map((b: { id: string }) => b.id) } },
      });

      for (const benefit of benefits) {
        const benefitData: any = {
          name: benefit.name,
          type: benefit.type,
          value: new Prisma.Decimal(benefit.value),
          serviceId: benefit.serviceId ?? null,
          maxUsesPerCycle: benefit.maxUsesPerCycle ?? null,
        };

        if (benefit.id) {
          await prisma.membershipBenefit.update({
            where: { id: benefit.id },
            data: benefitData,
          });
        } else {
          await prisma.membershipBenefit.create({
            data: { ...benefitData, planId: id },
          });
        }
      }
    }

    return prisma.membershipPlan.update({
      where: { id },
      data: updateData,
      include: { benefits: true },
    });
  }

  async getPlan(id: string) {
    return prisma.membershipPlan.findUnique({
      where: { id },
      include: { benefits: true },
    });
  }

  async listPlans(barbershopId: string) {
    if (!(prisma as any).membershipPlan?.findMany) return [];
    return prisma.membershipPlan.findMany({
      where: { barbershopId },
      include: { benefits: true },
      orderBy: { createdAt: "desc" },
    });
  }

  // ── Memberships ────────────────────────────────────

  async createMembership(data: CreateMembershipData) {
    const plan = await prisma.membershipPlan.findUnique({
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

    return prisma.membership.create({
      data: {
        barbershopId: data.barbershopId,
        planId: data.planId,
        clientId: data.clientId,
        status: "PENDING",
        startsAt: now,
        cycles: {
          create: {
            barbershopId: data.barbershopId,
            startDate: now,
            endDate: cycleEnd,
            status: "PENDING",
            amount: plan.price,
          },
        },
      },
      include: { plan: true, cycles: true },
    });
  }

  async getMembership(id: string) {
    return prisma.membership.findUnique({
      where: { id },
      include: {
        plan: { include: { benefits: true } },
        cycles: { orderBy: { startDate: "desc" } },
        benefitUsages: { orderBy: { createdAt: "desc" } },
        client: { select: { id: true, name: true, whatsapp: true } },
      },
    });
  }

  async listMemberships(barbershopId: string, filters: MembershipListFilters) {
    if (!(prisma as any).membership?.findMany) {
      return { items: [], total: 0, page: filters.page ?? 1, limit: filters.limit ?? 20 };
    }

    const where: Prisma.ClientMembershipWhereInput = { barbershopId };

    if (filters.status) where.status = filters.status as any;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.planId) where.planId = filters.planId;

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.membership.findMany({
        where,
        include: {
          plan: { select: { id: true, name: true, price: true } },
          client: { select: { id: true, name: true, whatsapp: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.membership.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async activateMembership(id: string) {
    return prisma.membership.update({
      where: { id },
      data: { status: "ACTIVE", startsAt: new Date() },
    });
  }

  async pauseMembership(id: string) {
    return prisma.membership.update({
      where: { id },
      data: { status: "PAUSED" },
    });
  }

  async resumeMembership(id: string) {
    return prisma.membership.update({
      where: { id },
      data: { status: "ACTIVE" },
    });
  }

  async cancelMembership(id: string) {
    return prisma.membership.update({
      where: { id },
      data: { status: "CANCELLED", endsAt: new Date() },
    });
  }

  // ── Cycles ─────────────────────────────────────────

  async createCycle(data: {
    membershipId: string;
    barbershopId: string;
    startDate: Date;
    endDate: Date;
    amount: number;
  }) {
    return prisma.membershipCycle.create({
      data: {
        membershipId: data.membershipId,
        barbershopId: data.barbershopId,
        startDate: data.startDate,
        endDate: data.endDate,
        amount: new Prisma.Decimal(data.amount),
        status: "PENDING",
      },
    });
  }

  async payCycle(cycleId: string, data: RecordPaymentData) {
    return prisma.membershipCycle.update({
      where: { id: cycleId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        paymentMethod: data.paymentMethod,
        notes: data.notes ?? null,
        idempotencyKey: data.idempotencyKey ?? null,
      },
    });
  }

  async listCycles(membershipId: string) {
    return prisma.membershipCycle.findMany({
      where: { membershipId },
      orderBy: { startDate: "desc" },
    });
  }

  async getOverdueCycles(barbershopId: string) {
    const now = new Date();
    return prisma.membershipCycle.findMany({
      where: {
        barbershopId,
        status: "PENDING",
        endDate: { lt: now },
      },
      include: {
        membership: {
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
    membershipId: string,
    benefitId: string,
    appointmentId: string,
    idempotencyKey?: string
  ) {
    if (idempotencyKey) {
      const existing = await prisma.membershipBenefitUsage.findFirst({
        where: { idempotencyKey },
      });
      if (existing) return existing;
    }

    return prisma.membershipBenefitUsage.create({
      data: {
        membershipId,
        benefitId,
        appointmentId,
        idempotencyKey: idempotencyKey ?? null,
      },
    });
  }

  async reverseBenefit(usageId: string) {
    return prisma.membershipBenefitUsage.update({
      where: { id: usageId },
      data: { reversedAt: new Date() },
    });
  }

  async getBenefitUsage(membershipId: string, benefitId: string) {
    const benefit = await prisma.membershipBenefit.findUnique({
      where: { id: benefitId },
    });

    const usedCount = await prisma.membershipBenefitUsage.count({
      where: {
        membershipId,
        benefitId,
        reversedAt: null,
      },
    });

    return {
      benefit,
      usedCount,
      maxUses: benefit?.maxUsesPerCycle ?? null,
      remaining: benefit?.maxUsesPerCycle != null ? benefit.maxUsesPerCycle - usedCount : null,
    };
  }
}
