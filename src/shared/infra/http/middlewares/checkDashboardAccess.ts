import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";

const TRIAL_DAYS = 30;

/**
 * Bloqueia rotas de dashboard (financeiro / relatórios do salão)
 * quando o plano ativo tem hasDashboard = false.
 * Trial de 30 dias libera acesso completo (captura + retenção).
 */
export async function checkDashboardAccess(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const user = request.user;
  if (!user || user.role === "MASTER_ADMIN") return;

  if (!user.barbershopId) {
    throw new AppError("Usuário não vinculado a nenhum salão", 400);
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: { id: user.barbershopId },
    select: {
      createdAt: true,
      subscriptions: {
        select: {
          status: true,
          plan: { select: { hasDashboard: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!barbershop) throw new AppError("Salão não encontrado", 404);

  const trialEnd = new Date(barbershop.createdAt);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
  if (new Date() <= trialEnd) return;

  const sub = barbershop.subscriptions[0];
  if (!sub) return; // checkSubscription já bloqueia sem assinatura

  if (!["ACTIVE", "TRIALING"].includes(sub.status)) return;

  if (sub.plan.hasDashboard === false) {
    throw new AppError(
      JSON.stringify({
        code: "DASHBOARD_REQUIRED",
        message:
          "Seu plano não inclui dashboard de relatórios e financeiro. Faça upgrade para o Pro.",
        upgradeHint: "pro",
      }),
      403
    );
  }
}
