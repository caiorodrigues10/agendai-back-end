import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  SUBSCRIPTION_STATUS_CONFIG,
  SUBSCRIPTION_MESSAGES
} from "@/shared/constants/subscriptionMessages";

const TRIAL_DAYS = 30;

export async function checkSubscription(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = request.user;

  if (!user || user.role === "MASTER_ADMIN") return;

  if (!user.barbershopId) {
    throw new AppError("Usuário não vinculado a nenhuma barbearia", 400);
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: { id: user.barbershopId },
    select: {
      id: true,
      createdAt: true,
      active: true,
      subscriptions: {
        select: {
          status: true,
          endDate: true,
          cancelDate: true,
          plan: { select: { name: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!barbershop || !barbershop.active) {
    throw new AppError("Barbearia inativa ou não encontrada", 403);
  }

  const now = new Date();
  const trialEnd = new Date(barbershop.createdAt);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

  if (now <= trialEnd) return;

  const subscription = barbershop.subscriptions[0];

  if (!subscription) {
    throw new AppError(SUBSCRIPTION_MESSAGES.TRIAL_EXPIRED, 402);
  }

  const config = SUBSCRIPTION_STATUS_CONFIG[subscription.status];
  const message = config?.message ?? SUBSCRIPTION_MESSAGES.NO_SUBSCRIPTION;

  if (!config?.allowed) {
    throw new AppError(message, 402);
  }
}