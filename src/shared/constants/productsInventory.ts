import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { TRIAL_DAYS } from "@/shared/constants/subscription";

/** Flag de rollout. Em produção fica desligada até PRODUCTS_INVENTORY_ENABLED=true. */
export function isProductsInventoryEnabled(): boolean {
  const raw = process.env.PRODUCTS_INVENTORY_ENABLED;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return process.env.NODE_ENV !== "production";
}

export async function assertProductsInventoryCapability(barbershopId: string, role?: string): Promise<void> {
  if (!isProductsInventoryEnabled()) {
    throw new AppError(
      JSON.stringify({
        code: "PRODUCTS_INVENTORY_DISABLED",
        message: "O módulo de produtos ainda não está disponível neste ambiente.",
      }),
      403
    );
  }
  if (role === "MASTER_ADMIN") return;
  const barbershop = await prisma.barbershop.findUnique({
    where: { id: barbershopId },
    select: {
      createdAt: true,
      subscriptions: {
        select: { status: true, plan: { select: { hasDashboard: true } } },
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
  if (!sub || !["ACTIVE", "TRIALING"].includes(sub.status)) return;
  if (sub.plan.hasDashboard === false) {
    throw new AppError(
      JSON.stringify({
        code: "PRODUCTS_INVENTORY_REQUIRED",
        message: "Catálogo, estoque e vendas de produtos estão disponíveis no plano Pro.",
        upgradeHint: "pro",
      }),
      403
    );
  }
}
