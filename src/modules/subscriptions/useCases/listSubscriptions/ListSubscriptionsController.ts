import { FastifyRequest, FastifyReply } from "fastify";
import { prisma, Prisma } from "@/libs/prismaClient";
import { SubscriptionStatus } from "@prisma/client";
import { TRIAL_DAYS } from "@/shared/constants/subscription";

type SubscriptionWithRelations = Prisma.SubscriptionGetPayload<{
  include: {
    plan: { select: { name: true; price: true; billingCycle: true } };
    barbershop: { select: { id: true; name: true; whatsapp: true; createdAt: true } };
    invoices: true;
  };
}>;

export class ListSubscriptionsController {
  async handle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { page = "1", limit = "20", status, search } = request.query as {
      page?: string; limit?: string; status?: string; search?: string;
    };

    const skip = (Number(page) - 1) * Number(limit);
    const take = Math.min(Number(limit), 100);

    const where: Prisma.SubscriptionWhereInput = {};
    if (status && status in SubscriptionStatus) {
      where.status = status as SubscriptionStatus;
    }
    if (search) {
      where.barbershop = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { cnpj: { contains: search } }
        ]
      };
    }

    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        skip,
        take, 
        orderBy: { createdAt: "desc" },
        include: {
          plan: { select: { name: true, price: true, billingCycle: true } },
          barbershop: { select: { id: true, name: true, whatsapp: true, createdAt: true } },
          invoices: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      }) as Promise<SubscriptionWithRelations[]>,
      prisma.subscription.count({ where })
    ]);

    const data = subscriptions.map((sub: SubscriptionWithRelations) => {
      const trialEndsAt = new Date(sub.barbershop?.createdAt ?? sub.createdAt);
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

      return {
        id: sub.id,
        barbershopId: sub.barbershopId,
        barbershopName: sub.barbershop?.name,
        planId: sub.planId,
        planName: sub.plan?.name,
        planPrice: sub.plan?.price,
        planBillingCycle: sub.plan?.billingCycle,
        status: sub.status,
        startDate: sub.startDate,
        endDate: sub.endDate,
        cancelDate: sub.cancelDate,
        cancelReason: sub.cancelReason ?? null,
        trialEndsAt,
        latestInvoice: sub.invoices?.[0] ?? null
      };
    });

    return reply.send({
      success: true,
      data,
      meta: { total, page: Number(page), limit: take, totalPages: Math.ceil(total / take) }
    });
  }
}