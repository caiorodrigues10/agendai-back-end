import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { buildSubscriptionResponse } from "../../utils/subscriptionMapper";
import { computePlanEconomics } from "../../utils/planEconomics";
import { TRIAL_DAYS } from "@/shared/constants/subscription";

async function loadActivePlans() {
  return prisma.plan.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      price: true,
      billingCycle: true,
      hasDashboard: true,
      tierKey: true,
      maxEmployees: true,
      features: true,
      description: true,
    },
    orderBy: { price: "asc" },
  });
}

export class GetSubscriptionController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user!;

    let barbershopId: string;

    if (user.role === "MASTER_ADMIN") {
      const { id } = request.params as { id?: string };
      const q = request.query as { barbershopId?: string };
      barbershopId = id ?? q.barbershopId ?? "";
      if (!barbershopId) throw new AppError("Informe o barbershopId", 400);
    } else {
      if (!user.barbershopId) throw new AppError("Usuário sem salão vinculado", 400);
      barbershopId = user.barbershopId;
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { id: true, createdAt: true, active: true }
    });

    if (!barbershop) throw new AppError("Salão não encontrado", 404);

    const subscription = await prisma.subscription.findUnique({
      where: { barbershopId },
      include: {
        plan: true,
        invoices: { orderBy: { createdAt: "desc" }, take: 5 }
      }
    });

    const plans = await loadActivePlans();

    // Trial Pro = createdAt + TRIAL_DAYS (independe do plano escolhido/assinado).
    // Quem assina Essencial no meio do trial continua com Pro até o fim; depois faz "downgrade".
    const trialEndsAt = new Date(barbershop.createdAt);
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
    const now = new Date();
    const isInTrial = now <= trialEndsAt;
    const daysRemainingInTrial = isInTrial
      ? Math.max(
          0,
          Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        )
      : 0;
    const trial = {
      isInTrial,
      trialEndsAt,
      daysRemainingInTrial,
      isExpired: !isInTrial,
    };

    if (!subscription) {
      const economics = computePlanEconomics({ plans });

      return reply.send({
        success: true,
        data: {
          subscription: null,
          trial,
          economics,
          plans,
        },
      });
    }

    const dto = buildSubscriptionResponse(subscription, barbershop.createdAt, TRIAL_DAYS);
    const economics = computePlanEconomics({
      plans,
      currentPlanId: subscription.planId,
      subscriptionStart: subscription.startDate,
    });

    return reply.send({
      success: true,
      data: {
        subscription: dto,
        trial,
        invoices: subscription.invoices,
        economics,
        plans,
      },
    });
  }
}