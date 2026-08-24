import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { TRIAL_DAYS } from "@/shared/constants/subscription";

const PUBLIC_UNAVAILABLE = "Estabelecimento temporariamente indisponível";

/**
 * Guard público para fila/agenda guest.
 * Exige salão existente, ativo e com trial/assinatura válida.
 * NÃO expõe planos, códigos de assinatura nem detalhes comerciais (sem 402).
 */
export async function assertPublicShopOperationalAccess(
  barbershopId: string
): Promise<void> {
  const barbershop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: {
      id: true,
      active: true,
      createdAt: true,
      subscriptions: {
        select: { status: true, endDate: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!barbershop || !barbershop.active) {
    throw new AppError("Estabelecimento não encontrado", 404);
  }

  const now = new Date();
  const trialEnd = new Date(barbershop.createdAt);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
  const isInTrial = now <= trialEnd;

  const subscription = barbershop.subscriptions[0];
  const hasActiveSubscription =
    !!subscription &&
    (["TRIALING", "ACTIVE"].includes(subscription.status) ||
      (subscription.status === "CANCELED" &&
        !!subscription.endDate &&
        subscription.endDate > now));

  if (!isInTrial && !hasActiveSubscription) {
    throw new AppError(PUBLIC_UNAVAILABLE, 403);
  }
}
