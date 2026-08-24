import { prisma } from "@/libs/prismaClient";

/** Retorna todos os planos ativos ordenados por preço. */
export async function getAvailablePlans() {
  return prisma.plan.findMany({
    where: { active: true },
    orderBy: { price: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      billingCycle: true,
      maxEmployees: true,
      hasDashboard: true,
      tierKey: true,
      features: true,
    },
  });
}
