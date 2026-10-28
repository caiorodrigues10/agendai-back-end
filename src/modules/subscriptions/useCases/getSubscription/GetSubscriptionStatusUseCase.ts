import { prisma } from "@/libs/prismaClient";
import { TRIAL_DAYS } from "@/shared/constants/subscription";

/**
 * Resumo do plano do estabelecimento.
 *
 * Mesma informação que a tela de assinatura mostra, em formato compacto —
 * usado pelo assistente do WhatsApp para responder "status do plano".
 */
export type SubscriptionStatusSummary = {
  planName: string | null;
  status: string | null;
  active: boolean;
  inTrial: boolean;
  trialEndsAt: Date | null;
  endDate: Date | null;
  cancelDate: Date | null;
  price: number | null;
};

export class GetSubscriptionStatusUseCase {
  async execute(barbershopId: string): Promise<SubscriptionStatusSummary> {
    const barbershop = await prisma.barbershop.findUnique({
      where: { id: barbershopId },
      select: {
        createdAt: true,
        subscriptions: {
          select: {
            status: true,
            endDate: true,
            cancelDate: true,
            plan: { select: { name: true, price: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!barbershop) {
      return {
        planName: null,
        status: null,
        active: false,
        inTrial: false,
        trialEndsAt: null,
        endDate: null,
        cancelDate: null,
        price: null,
      };
    }

    const subscription = barbershop.subscriptions[0];
    const trialEndsAt = new Date(barbershop.createdAt);
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
    const inTrial = new Date() <= trialEndsAt;

    const active =
      inTrial ||
      (subscription
        ? ["ACTIVE", "TRIALING"].includes(subscription.status) &&
          (!subscription.endDate || new Date(subscription.endDate) >= new Date())
        : false);

    return {
      planName: subscription?.plan?.name ?? null,
      status: subscription?.status ?? (inTrial ? "TRIAL" : null),
      active,
      inTrial,
      trialEndsAt,
      endDate: subscription?.endDate ?? null,
      cancelDate: subscription?.cancelDate ?? null,
      price: subscription?.plan?.price ?? null,
    };
  }
}
