import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { buildSubscriptionResponse } from "../../utils/subscriptionMapper";

const TRIAL_DAYS = 30;

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
      if (!user.barbershopId) throw new AppError("Usuário sem barbearia vinculada", 400);
      barbershopId = user.barbershopId;
    }

    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: { id: true, createdAt: true, active: true }
    });

    if (!barbershop) throw new AppError("Barbearia não encontrada", 404);

    const subscription = await prisma.subscription.findUnique({
      where: { barbershopId },
      include: {
        plan: true,
        invoices: { orderBy: { createdAt: "desc" }, take: 5 }
      }
    });

    if (!subscription) {
      const trialEndsAt = new Date(barbershop.createdAt);
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

      const now = new Date();
      const isInTrial = now <= trialEndsAt;
      const daysRemainingInTrial = isInTrial
        ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;

      return reply.send({
        success: true,
        data: {
          subscription: null,
          trial: { isInTrial, trialEndsAt, daysRemainingInTrial, isExpired: !isInTrial }
        }
      });
    }

    const dto = buildSubscriptionResponse(subscription, barbershop.createdAt, TRIAL_DAYS);

    return reply.send({
      success: true,
      data: { subscription: dto, invoices: subscription.invoices }
    });
  }
}