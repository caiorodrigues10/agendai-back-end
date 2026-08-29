import { prisma } from "@/libs/prismaClient";
import { computePlanEconomics } from "../../utils/planEconomics";
import { AppError } from "@/shared/errors/AppError";
import { getProratedRefundInfo } from "@/modules/payments/services/proratedRefundService";

export interface CancellationContextResult {
  hasUsage: boolean;
  usageDays: number;
  appointmentsTotal: number;
  appointmentsCompleted: number;
  queueCompleted: number;
  postsPublished: number;
  revenue: number;
  uniqueCustomers: number;
  savingsSoFar: number;
  yearlySavingsPerYear: number;
  currentBillingCycle: "MONTHLY" | "YEARLY" | null;
  planName: string | null;
  /** Há período pago não utilizado → reembolso proporcional automático disponível. */
  proratedRefundAvailable: boolean;
  /** Provedor do pagamento aprovado (ABACATEPAY exige chave PIX para devolução). */
  refundProvider: "ABACATEPAY" | "MERCADOPAGO" | "ASAAS" | null;
}

function emptyContext(): CancellationContextResult {
  return {
    hasUsage: false,
    usageDays: 0,
    appointmentsTotal: 0,
    appointmentsCompleted: 0,
    queueCompleted: 0,
    postsPublished: 0,
    revenue: 0,
    uniqueCustomers: 0,
    savingsSoFar: 0,
    yearlySavingsPerYear: 0,
    currentBillingCycle: null,
    planName: null,
    proratedRefundAvailable: false,
    refundProvider: null,
  };
}

export class CancellationContextUseCase {
  async execute(
    user: { role: string; barbershopId?: string },
    barbershopIdParam?: string
  ): Promise<CancellationContextResult> {
    const barbershopId =
      user.role === "MASTER_ADMIN"
        ? barbershopIdParam
        : user.barbershopId;

    if (!barbershopId) {
      return emptyContext();
    }

    const [barbershop, subscription] = await Promise.all([
      prisma.barbershop.findUnique({
        where: { id: barbershopId },
        select: { id: true, createdAt: true },
      }),
      prisma.subscription.findUnique({
        where: { barbershopId },
        include: { plan: { select: { id: true, name: true, price: true, billingCycle: true, tierKey: true, hasDashboard: true } } },
      }),
    ]);

    if (!barbershop) {
      throw new AppError("Salão não encontrado", 404);
    }

    const [appointmentsTotal, appointmentsCompleted, queueCompleted, postsPublished, completedQueueItems, services] =
      await Promise.all([
        prisma.appointment.count({ where: { barbershopId } }),
        prisma.appointment.count({
          where: { barbershopId, status: "COMPLETED" },
        }),
        prisma.queueItem.count({
          where: { barbershopId, status: "COMPLETED" },
        }),
        prisma.feedPost.count({
          where: { barbershopId, status: "PUBLISHED" },
        }),
        prisma.queueItem.findMany({
          where: { barbershopId, status: "COMPLETED" },
          select: {
            serviceId: true,
            finalPrice: true,
            whatsapp: true,
            customerName: true,
          },
        }),
        prisma.service.findMany({
          where: { barbershopId },
          select: { id: true, price: true },
        }),
      ]);

    const serviceMap = new Map<string, number>(services.map((s: { id: string; price: number }) => [s.id, s.price]));

    const revenue = completedQueueItems.reduce((sum: number, q: { finalPrice: number | null; serviceId: string }) => {
      return sum + (q.finalPrice ?? serviceMap.get(q.serviceId) ?? 0);
    }, 0);

    const uniqueCustomers = new Set(
      completedQueueItems
        .map((q: { whatsapp: string }) => (q.whatsapp || "").trim())
        .filter(Boolean)
    ).size;

    const startRef = subscription?.startDate ?? barbershop.createdAt;
    const usageDays = Math.max(
      0,
      Math.floor(
        (Date.now() - startRef.getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    let savingsSoFar = 0;
    let yearlySavingsPerYear = 0;
    let currentBillingCycle: "MONTHLY" | "YEARLY" | null = null;

    if (subscription) {
      const plans = await prisma.plan.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          price: true,
          billingCycle: true,
          tierKey: true,
          hasDashboard: true,
        },
      });

      const economics = computePlanEconomics({
        plans,
        currentPlanId: subscription.planId,
        subscriptionStart: subscription.startDate,
      });

      savingsSoFar = economics.savedSoFar;
      yearlySavingsPerYear = economics.yearlySavingsPerYear;
      currentBillingCycle = economics.currentBillingCycle;
    }

    const hasUsage =
      appointmentsCompleted > 0 ||
      queueCompleted > 0 ||
      postsPublished > 0 ||
      revenue > 0;

    let proratedRefundAvailable = false;
    let refundProvider: "ABACATEPAY" | "MERCADOPAGO" | "ASAAS" | null = null;

    if (subscription) {
      const info = await getProratedRefundInfo({
        barbershopId,
        subscription: {
          id: subscription.id,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          plan: subscription.plan,
        },
      });
      proratedRefundAvailable = info.available;
      refundProvider = info.provider;
    }

    return {
      hasUsage,
      usageDays,
      appointmentsTotal,
      appointmentsCompleted,
      queueCompleted,
      postsPublished,
      revenue: Math.round(revenue * 100) / 100,
      uniqueCustomers,
      savingsSoFar,
      yearlySavingsPerYear,
      currentBillingCycle,
      planName: subscription?.plan?.name ?? null,
      proratedRefundAvailable,
      refundProvider,
    };
  }
}