import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { SUBSCRIPTION_MESSAGES } from "@/shared/constants/subscriptionMessages";
import { blockEntity, assertCpfNotBlocked } from "@/shared/services/blockedEntityService";
import { normalizeCpf } from "@/shared/utils/cpfUtils";

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

/**
 * Verifica se a barbearia tem acesso ativo.
 * Se o acesso expirou, bloqueia automaticamente os CPFs dos owners
 * e lança 402 com a lista de planos disponíveis.
 */
export async function checkBarbershopAccess(
  barbershopId: string,
  userCpf?: string
): Promise<void> {
  // Se o usuário forneceu CPF, verifica bloqueio individual primeiro
  if (userCpf) {
    await assertCpfNotBlocked(userCpf);
  }

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
    // Bloqueia automaticamente os CPFs dos owners desta barbearia
    await blockOwnerCpfs(barbershopId);

    const plans = await getAvailablePlans();
    buildSubscriptionRequiredError(SUBSCRIPTION_MESSAGES.LOGIN_EXPIRED, plans, barbershopId);
  }
}

/**
 * Bloqueia os CPFs de todos os owners da barbearia que tenham CPF cadastrado.
 * Idempotente — não cria duplicatas se já estiver bloqueado.
 */
export async function blockOwnerCpfs(barbershopId: string): Promise<void> {
  const owners = await prisma.user.findMany({
    where: {
      barbershopId,
      role: "OWNER",
      cpf: { not: null },
      active: true
    },
    select: { cpf: true, name: true }
  });

  for (const owner of owners) {
    if (!owner.cpf) continue;
    await blockEntity({
      type: "CPF",
      value: owner.cpf,
      reason: `Assinatura da barbearia ${barbershopId} expirada sem renovação.`,
      barbershopId,
      blockedBy: "system",
      idempotent: true
    });
  }
}

/**
 * Desbloqueia os CPFs dos owners de uma barbearia.
 * Chamado no webhook de pagamento aprovado.
 */
export async function unblockOwnerCpfs(
  barbershopId: string,
  unblockedBy: string,
  externalRef?: string
): Promise<void> {
  const { unblockEntity } = await import("@/shared/services/blockedEntityService");

  const owners = await prisma.user.findMany({
    where: {
      barbershopId,
      role: "OWNER",
      cpf: { not: null }
    },
    select: { cpf: true }
  });

  for (const owner of owners) {
    if (!owner.cpf) continue;
    await unblockEntity({
      type: "CPF",
      value: owner.cpf,
      unblockedBy,
      externalRef
    });
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
    const plans = await getAvailablePlans();
    buildSubscriptionRequiredError(SUBSCRIPTION_MESSAGES.CNPJ_EXPIRED, plans, existingBarbershop.id);
  }
}