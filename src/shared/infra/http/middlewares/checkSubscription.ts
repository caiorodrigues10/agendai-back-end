import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import {
  SUBSCRIPTION_STATUS_CONFIG,
  SUBSCRIPTION_MESSAGES,
} from "@/shared/constants/subscriptionMessages";
import { blockOwnerCpfs } from "@/modules/subscriptions/utils/checkBarbershopAccess";
import { assertCpfNotBlocked } from "@/shared/services/blockedEntityService";

const TRIAL_DAYS = 30;

// ── Cache in-memory para status de assinatura (reduz hits no banco) ──────────
// TTL de 60 segundos: aceitável para verificação de acesso.
// Em alta carga substitua por Redis.
const subscriptionCache = new Map<string, { allowed: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

function getCachedAccess(barbershopId: string): boolean | null {
  const entry = subscriptionCache.get(barbershopId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    subscriptionCache.delete(barbershopId);
    return null;
  }
  return entry.allowed;
}

function setCachedAccess(barbershopId: string, allowed: boolean): void {
  subscriptionCache.set(barbershopId, { allowed, expiresAt: Date.now() + CACHE_TTL_MS });
}



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

  // Verifica bloqueio de CPF mid-session (cobre o gap de até 15min do JWT)
  // Nota: request.user não carrega cpf; buscamos via token sub → user.id no banco
  // Para não adicionar query extra por padrão, delegamos ao login (checkBarbershopAccess).
  // Verifica bloqueio de CPF em toda requisição (cobre o gap de até 15min do JWT)
  if (user.cpf) {
    await assertCpfNotBlocked(user.cpf);
  }

  if (!user.barbershopId) {
    throw new AppError("Usuário não vinculado a nenhuma barbearia", 400);
  }

  // Verifica cache antes de ir ao banco
  const cached = getCachedAccess(user.barbershopId);
  if (cached === true) return;  // acesso permitido em cache — skip

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
  if (now <= trialEnd) { setCachedAccess(user.barbershopId, true); return; }

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

  // Assinatura ativa — cacheia o resultado
  setCachedAccess(user.barbershopId, true);

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
