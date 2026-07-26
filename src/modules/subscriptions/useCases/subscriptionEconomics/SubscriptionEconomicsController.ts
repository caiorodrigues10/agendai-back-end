import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { computePlatformEconomics } from "../../utils/planEconomics";

export class SubscriptionEconomicsController {
  async handle(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const [plans, subscriptions] = await Promise.all([
      prisma.plan.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          price: true,
          billingCycle: true,
          tierKey: true,
          hasDashboard: true,
        },
      }),
      prisma.subscription.findMany({
        where: { status: { in: ["ACTIVE", "TRIALING"] } },
        select: { planId: true, status: true, startDate: true },
      }),
    ]);

    const economics = computePlatformEconomics({ plans, subscriptions });

    return reply.send({
      success: true,
      data: {
        ...economics,
        plans,
      },
    });
  }
}
