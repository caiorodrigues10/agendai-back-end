import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { SUBSCRIPTION_MESSAGES } from "@/shared/constants/subscriptionMessages";

const TRIAL_DAYS = 30;

async function getAvailablePlans() {
  return prisma.plan.findMany({
    where: { active: true },
    orderBy: { price: "asc" },
    select: {
      id: true, name: true, description: true,
      price: true, maxEmployees: true, features: true
    }
  });
}

function buildSubscriptionRequiredError(
  message: string,
  plans: any[],
  barbershopId?: string
) {
  throw new AppError(
    JSON.stringify({
      code: "SUBSCRIPTION_REQUIRED",
      message,
      plans,
      ...(barbershopId && { barbershopId })
    }),
    402
  );
}

export async function checkBarbershopAccess(barbershopId: string): Promise<void> {
  const barbershop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: {
      createdAt: true,
      subscriptions: {
        select: { status: true, endDate: true },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!barbershop) return;

  const now = new Date();
  const trialEnd = new Date(barbershop.createdAt);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

  const subscription = barbershop.subscriptions[0];
  const isInTrial = now <= trialEnd;
  const hasActiveSubscription =
    subscription && ["TRIALING", "ACTIVE"].includes(subscription.status);

  if (!isInTrial && !hasActiveSubscription) {
    const plans = await getAvailablePlans();
    buildSubscriptionRequiredError(SUBSCRIPTION_MESSAGES.LOGIN_EXPIRED, plans, barbershopId);
  }
}

export async function checkCnpjAccess(cnpj: string): Promise<void> {
  const existingBarbershop = await prisma.barbershop.findUnique({
    where: { cnpj },
    select: {
      id: true,
      createdAt: true,
      subscriptions: {
        select: { status: true },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });
  
  if (!existingBarbershop) return;

  const now = new Date();
  const trialEnd = new Date(existingBarbershop.createdAt);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

  const subscription = existingBarbershop.subscriptions[0];
  const isInTrial = now <= trialEnd;
  const hasActiveSubscription =
    subscription && ["TRIALING", "ACTIVE"].includes(subscription.status);

  if (!isInTrial && !hasActiveSubscription) {
    // CNPJ existe mas está expirado — manda para tela de planos
    const plans = await getAvailablePlans();
    buildSubscriptionRequiredError(SUBSCRIPTION_MESSAGES.CNPJ_EXPIRED, plans, existingBarbershop.id);
  }

  // CNPJ existe e está ativo — deixa o CreateBarbershopUseCase lançar o erro de duplicata
}