import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AsaasService } from "@/modules/payments/services/AsaasService";
import { IPaymentRepository } from "@/modules/payments/repositories/IPaymentRepository";
import { handleSubscriptionPaymentWebhook } from "@/modules/subscriptions/services/handleSubscriptionPaymentWebhook";
import { invalidateSubscriptionCache } from "@/shared/infra/http/middlewares/subscriptionAccessCache";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("subscriptions:charge-trial-ended");

export interface ChargeTrialEndedResult {
  scanned: number;
  charged: number;
  activated: number;
  failed: number;
  skipped: number;
  errors: Array<{ subscriptionId: string; message: string }>;
}

/**
 * Cobra cartão vaulted de assinaturas TRIALING cujo trial já encerrou.
 * Idempotente: se já existe invoice PENDING/PAID recente para o ciclo, pula.
 */
@injectable()
export class ChargeTrialEndedSubscriptionsUseCase {
  constructor(
    @inject("AsaasService")
    private asaasService: AsaasService,
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository
  ) {}

  async execute(now = new Date()): Promise<ChargeTrialEndedResult> {
    const result: ChargeTrialEndedResult = {
      scanned: 0,
      charged: 0,
      activated: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    const due = await prisma.subscription.findMany({
      where: {
        status: "TRIALING",
        asaasCreditCardToken: { not: null },
        asaasCustomerId: { not: null },
        OR: [{ endDate: { lte: now } }, { endDate: null }],
      },
      include: {
        plan: true,
        barbershop: { select: { id: true, name: true, createdAt: true } },
      },
      take: 50,
    });

    result.scanned = due.length;

    for (const sub of due) {
      try {
        if (!sub.asaasCustomerId || !sub.asaasCreditCardToken) {
          result.skipped += 1;
          continue;
        }

        // endDate null: só cobra se createdAt+trial já passou — endDate é setado no setup
        if (sub.endDate && sub.endDate > now) {
          result.skipped += 1;
          continue;
        }

        const pendingInvoice = await prisma.invoice.findFirst({
          where: {
            subscriptionId: sub.id,
            status: { in: ["PENDING", "PAID"] },
            createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { createdAt: "desc" },
        });
        if (pendingInvoice) {
          result.skipped += 1;
          continue;
        }

        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + 1);

        const invoice = await prisma.invoice.create({
          data: {
            subscriptionId: sub.id,
            amount: sub.plan.price,
            dueDate,
            status: "PENDING",
            paymentMethod: "credit_card",
          },
        });

        const externalReference = `ag-sub-${sub.id}-inv-${invoice.id}`;
        const description = `Assinatura AgendAI — ${sub.plan.name} (pós-trial)`;

        const payment = await this.asaasService.createPayment({
          customer: sub.asaasCustomerId,
          billingType: "CREDIT_CARD",
          value: sub.plan.price,
          dueDate: dueDate.toISOString().slice(0, 10),
          description,
          externalReference,
          creditCardToken: sub.asaasCreditCardToken,
          remoteIp: "127.0.0.1",
        });

        const localStatus = this.asaasService.mapStatusToLocal(payment.status);

        await this.paymentRepo.create({
          mpPaymentId: null,
          provider: "ASAAS",
          providerPaymentId: payment.id,
          status: localStatus as any,
          statusDetail: payment.status,
          paymentMethod: "credit_card",
          transactionAmount: sub.plan.price,
          currency: "BRL",
          description,
          barbershopId: sub.barbershopId,
          externalReference,
          rawResponse: JSON.stringify(payment),
        });

        result.charged += 1;

        if (localStatus === "approved") {
          await handleSubscriptionPaymentWebhook(externalReference, "approved");
          result.activated += 1;
        } else if (localStatus === "rejected" || localStatus === "cancelled") {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { status: "PAST_DUE" },
          });
          await invalidateSubscriptionCache(sub.barbershopId);
          result.failed += 1;
          result.errors.push({
            subscriptionId: sub.id,
            message: `Cartão recusado (${payment.status})`,
          });
        }
      } catch (err: any) {
        result.failed += 1;
        result.errors.push({
          subscriptionId: sub.id,
          message: err?.message ?? String(err),
        });
        try {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { status: "PAST_DUE" },
          });
          await invalidateSubscriptionCache(sub.barbershopId);
        } catch (recoveryErr) {
          logger.error({ err: recoveryErr, subscriptionId: sub.id }, "Falha ao recuperar subscription (PAST_DUE) após erro de cobrança");
        }
      }
    }

    return result;
  }
}
