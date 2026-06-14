import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  SUBSCRIPTION_STATUS_CONFIG,
  SUBSCRIPTION_MESSAGES,
} from "@/shared/constants/subscriptionMessages";
import { blockOwnerCpfs } from "@/modules/subscriptions/utils/checkBarbershopAccess";

const TRIAL_DAYS = 30;

async function getAvailablePlans() {
  return prisma.plan.findMany({
    where: { active: true },
    orderBy: { price: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      maxEmployees: true,
      features: true,
    },
  });
}

/**
 * Middleware que verifica se a barbearia do usuário autenticado
 * possui acesso ativo (trial ou assinatura).
 *
 * Retorna 402 com estrutura JSON padronizada contendo os planos disponíveis,
 * idêntica à estrutura usada em checkBarbershopAccess.ts (login).
 */
export async function checkSubscription(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const user = request.user;

  // MASTER_ADMIN bypassa a checagem de assinatura
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
          plan: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!barbershop || !barbershop.active) {
    throw new AppError("Barbearia inativa ou não encontrada", 403);
  }

  const now = new Date();
  const trialEnd = new Date(barbershop.createdAt);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

  // Dentro do trial — acesso liberado
  if (now <= trialEnd) return;

  const subscription = barbershop.subscriptions[0];

  if (!subscription) {
    // Trial expirou sem assinatura — bloqueia CPFs e retorna 402 com planos
    blockOwnerCpfs(user.barbershopId).catch((err) =>
      request.log.warn({ err }, "checkSubscription: falha ao bloquear CPFs dos owners")
    );

    const plans = await getAvailablePlans();
    throw new AppError(
      JSON.stringify({
        code: "SUBSCRIPTION_REQUIRED",
        message: SUBSCRIPTION_MESSAGES.TRIAL_EXPIRED,
        plans,
        barbershopId: user.barbershopId,
      }),
      402
    );
  }

  const config = SUBSCRIPTION_STATUS_CONFIG[subscription.status];

  if (!config?.allowed) {
    blockOwnerCpfs(user.barbershopId).catch((err) =>
      request.log.warn({ err }, "checkSubscription: falha ao bloquear CPFs dos owners")
    );

    const plans = await getAvailablePlans();
    throw new AppError(
      JSON.stringify({
        code: "SUBSCRIPTION_REQUIRED",
        message: config?.message ?? SUBSCRIPTION_MESSAGES.NO_SUBSCRIPTION,
        plans,
        barbershopId: user.barbershopId,
        subscriptionStatus: subscription.status,
      }),
      402
    );
  }
}
