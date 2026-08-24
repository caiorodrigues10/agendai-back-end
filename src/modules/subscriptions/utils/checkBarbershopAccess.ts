import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { SUBSCRIPTION_MESSAGES } from "@/shared/constants/subscriptionMessages";
import { blockEntity, assertCpfNotBlocked } from "@/shared/services/blockedEntityService";
import { TRIAL_DAYS } from "@/shared/constants/subscription";
import { getAvailablePlans } from "@/shared/utils/planUtils";
import { subscriptionGrantsAccess } from "@/shared/utils/subscriptionAccess";

function buildSubscriptionRequiredError(
  message: string,
  plans: any[],
  barbershopId?: string,
  extra?: Record<string, unknown>
) {
  throw new AppError(
    JSON.stringify({
      code: "SUBSCRIPTION_REQUIRED",
      message,
      plans,
      ...(barbershopId && { barbershopId }),
      ...extra,
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
        select: { status: true, endDate: true, asaasCreditCardToken: true },
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
  const access = subscriptionGrantsAccess(subscription, now, trialEnd);

  // Login libera JWT mesmo sem cartão (CARD_REQUIRED): o FE manda ao checkout.
  // Bloqueia só quando o calendário de trial acabou e não há assinatura válida.
  if (access.allowed || access.cardRequired) return;

  await blockOwnerCpfs(barbershopId);
  const plans = await getAvailablePlans();
  buildSubscriptionRequiredError(SUBSCRIPTION_MESSAGES.LOGIN_EXPIRED, plans, barbershopId);
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
  // findFirst: cnpj não possui constraint @unique no schema
  const existingBarbershop = await prisma.barbershop.findFirst({
    where: { cnpj },
    select: {
      id: true,
      createdAt: true,
      subscriptions: {
        select: { status: true, endDate: true, asaasCreditCardToken: true },
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
  const access = subscriptionGrantsAccess(subscription, now, trialEnd);

  if (access.allowed) return;

  // CNPJ já cadastrado sem acesso: pede reativação (plano), não novo cadastro
  const plans = await getAvailablePlans();
  buildSubscriptionRequiredError(
    access.cardRequired
      ? SUBSCRIPTION_MESSAGES.CARD_REQUIRED
      : SUBSCRIPTION_MESSAGES.CNPJ_EXPIRED,
    plans,
    existingBarbershop.id,
    access.cardRequired ? { reason: "CARD_REQUIRED" } : undefined
  );
}