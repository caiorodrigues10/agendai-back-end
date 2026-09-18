import { prisma } from "@/libs/prismaClient";
import { Prisma } from "@prisma/client";

export interface CreateGoalData {
  barbershopId: string;
  professionalId: string;
  metric: string;
  target: number;
  period: string;
  startDate: Date;
  endDate: Date;
}

export class GoalRepository {
  async create(data: CreateGoalData) {
    return prisma.professionalGoal.create({
      data: {
        barbershopId: data.barbershopId,
        professionalId: data.professionalId,
        metric: data.metric,
        target: new Prisma.Decimal(data.target),
        period: data.period,
        startDate: data.startDate,
        endDate: data.endDate,
      },
    });
  }

  async update(id: string, data: { target?: number; endDate?: Date }) {
    return prisma.professionalGoal.update({
      where: { id },
      data: {
        ...(data.target !== undefined ? { target: new Prisma.Decimal(data.target) } : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate } : {}),
      },
    });
  }

  async findById(id: string) {
    return prisma.professionalGoal.findUnique({ where: { id } });
  }

  async list(barbershopId: string, filters: { professionalId?: string; period?: string }) {
    const where: Prisma.ProfessionalGoalWhereInput = { barbershopId };
    if (filters.professionalId) where.professionalId = filters.professionalId;
    if (filters.period) where.period = filters.period;

    return prisma.professionalGoal.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async getProgress(goalId: string, barbershopId: string) {
    const goal = await prisma.professionalGoal.findUnique({ where: { id: goalId } });
    if (!goal || goal.barbershopId !== barbershopId) return null;

    let current = 0;

    if (goal.metric === "REVENUE") {
      const result = await prisma.queueItem.aggregate({
        where: {
          barbershopId,
          completedBy: goal.professionalId,
          status: "COMPLETED",
          completedAt: { gte: goal.startDate, lte: goal.endDate },
        },
        _sum: { finalPrice: true },
      });
      current = Number(result._sum.finalPrice ?? 0);
    } else if (goal.metric === "APPOINTMENTS") {
      current = await prisma.appointment.count({
        where: {
          barbershopId,
          staffId: goal.professionalId,
          date: { gte: goal.startDate, lte: goal.endDate },
          status: "COMPLETED",
        },
      });
    } else if (goal.metric === "PRODUCTS_SOLD") {
      const result = await prisma.retailSale.aggregate({
        where: {
          barbershopId,
          soldById: goal.professionalId,
          soldAt: { gte: goal.startDate, lte: goal.endDate },
          status: "COMPLETED",
        },
        _sum: { total: true },
      });
      current = Number(result._sum.total ?? 0);
    }

    const target = Number(goal.target);
    const percentage = target > 0 ? Math.round((current / target) * 100) : 0;

    return { goal, current, target, percentage };
  }

  async getRanking(barbershopId: string, metric: string | undefined, startDate: Date, endDate: Date) {
    const goals = await prisma.professionalGoal.findMany({
      where: {
        barbershopId,
        ...(metric ? { metric } : {}),
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });

    const ranking = await Promise.all(
      goals.map(async (goal: (typeof goals)[number]) => {
        const progress = await this.getProgress(goal.id, barbershopId);
        return progress;
      })
    );

    return ranking
      .filter(Boolean)
      .sort((a, b) => (b?.percentage ?? 0) - (a?.percentage ?? 0));
  }
}
