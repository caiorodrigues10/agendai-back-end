import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  SUBSCRIPTION_STATUS_CONFIG,
  SUBSCRIPTION_MESSAGES,
} from "@/shared/constants/subscriptionMessages";
import { blockOwnerCpfs } from "@/modules/subscriptions/utils/checkBarbershopAccess";
import { assertCpfNotBlocked } from "@/shared/services/blockedEntityService";
import {
  getCachedAccess,
  setCachedAccess,
  invalidateSubscriptionCache,
} from "./subscriptionAccessCache";
import { TRIAL_DAYS } from "@/shared/constants/subscription";
import { getAvailablePlans } from "@/shared/utils/planUtils";
import { subscriptionGrantsAccess } from "@/shared/utils/subscriptionAccess";

export { invalidateSubscriptionCache } from "./subscriptionAccessCache";

/**
 * Middleware que verifica se a barbearia do usuário autenticado
 * possui acesso ativo (trial com cartão vaulted ou assinatura paga).
 */
export async function checkSubscription(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const user = request.user;

  if (!user || user.role === "MASTER_ADMIN") return;

  if (user.cpf) {
    await assertCpfNotBlocked(user.cpf);
  }

  if (!user.barbershopId) {
    throw new AppError("Usuário não vinculado a nenhum salão", 400);
  }

  const cached = await getCachedAccess(user.barbershopId);
  if (cached === true) return;
  if (cached === false) {
    const plans = await getAvailablePlans();
    throw new AppError(
      JSON.stringify({
        code: "SUBSCRIPTION_REQUIRED",
        message: SUBSCRIPTION_MESSAGES.NO_SUBSCRIPTION,
        plans,
        barbershopId: user.barbershopId,
      }),
      402
    );
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
          asaasCreditCardToken: true,
          plan: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!barbershop || !barbershop.active) {
    await setCachedAccess(user.barbershopId, false);
    throw new AppError("Salão inativo ou não encontrado", 403);
  }

  const now = new Date();
  const trialEnd = new Date(barbershop.createdAt);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

  const subscription = barbershop.subscriptions[0];
  const access = subscriptionGrantsAccess(subscription, now, trialEnd);

  if (access.allowed) {
    await setCachedAccess(user.barbershopId, true);
    return;
  }

  await setCachedAccess(user.barbershopId, false);

  const plans = await getAvailablePlans();

  if (access.cardRequired) {
    throw new AppError(
      JSON.stringify({
        code: "SUBSCRIPTION_REQUIRED",
        reason: "CARD_REQUIRED",
        message: SUBSCRIPTION_MESSAGES.CARD_REQUIRED,
        plans,
        barbershopId: user.barbershopId,
      }),
      402
    );
  }

  blockOwnerCpfs(user.barbershopId).catch((err) =>
    request.log.warn({ err }, "checkSubscription: falha ao bloquear CPFs dos owners")
  );

  const statusMessage = subscription
    ? SUBSCRIPTION_STATUS_CONFIG[subscription.status]?.message
    : undefined;

  throw new AppError(
    JSON.stringify({
      code: "SUBSCRIPTION_REQUIRED",
      message:
        statusMessage ??
        (subscription
          ? SUBSCRIPTION_MESSAGES.NO_SUBSCRIPTION
          : SUBSCRIPTION_MESSAGES.TRIAL_EXPIRED),
      plans,
      barbershopId: user.barbershopId,
      ...(subscription ? { subscriptionStatus: subscription.status } : {}),
    }),
    402
  );
}
