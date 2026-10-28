import { prisma } from "@/libs/prismaClient";
import { TRIAL_DAYS } from "@/shared/constants/subscription";
import { subscriptionGrantsAccess } from "@/shared/utils/subscriptionAccess";

/**
 * Acesso do estabelecimento ao assistente.
 *
 * Mesma regra do middleware `checkSubscription`: trial de 30 dias sem cartão
 * ou assinatura paga. Sem acesso, o bot avisa e não executa nada.
 */
export async function hasOwnerBotAccess(barbershopId: string): Promise<boolean> {
  const barbershop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
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

  if (!barbershop || !barbershop.active) return false;

  const trialEnd = new Date(barbershop.createdAt);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

  return subscriptionGrantsAccess(barbershop.subscriptions[0], new Date(), trialEnd).allowed;
}
