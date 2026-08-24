import { inject, injectable } from "tsyringe";
import { prisma, Prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { MercadoPagoService } from "../../services/MercadoPagoService";
import { AbacatePayService } from "../../services/AbacatePayService";
import { AsaasService } from "../../services/AsaasService";
import { cancelSubscriptionForBarbershop } from "@/modules/subscriptions/services/cancelSubscriptionService";
import { invalidateSubscriptionCache } from "@/shared/infra/http/middlewares/subscriptionAccessCache";
import { revokeReferralOnCancellation } from "@/modules/referrals/services/referralService";

const INVOICE_REFERENCE_PATTERN = /^(?:bq|ag)-sub-([0-9a-f-]+)-inv-([0-9a-f-]+)$/;

@injectable()
export class RefundPaymentUseCase {
  constructor(
    @inject("MercadoPagoService")
    private mpService: MercadoPagoService,
    @inject("AbacatePayService")
    private abacateService: AbacatePayService,
    @inject("AsaasService")
    private asaasService: AsaasService
  ) {}

  async execute(
    paymentId: string,
    reason: string,
    admin: { id: string; role: string }
  ) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new AppError("Pagamento não encontrado", 404);
    }

    if (admin.role !== "MASTER_ADMIN") {
      throw new AppError(
        "Acesso negado: apenas administradores podem reembolsar pagamentos",
        403
      );
    }

    if (payment.status !== "approved") {
      throw new AppError(
        "Pagamento não pode ser reembolsado no status atual",
        400
      );
    }

    const existingRefund = await prisma.refund.findFirst({
      where: { paymentId, status: "SUCCEEDED" },
    });
    if (existingRefund) {
      throw new AppError("Pagamento já reembolsado", 400);
    }

    let providerIdentifier: string | null = null;
    if (payment.provider === "ABACATEPAY" || payment.provider === "ASAAS") {
      providerIdentifier = payment.providerPaymentId;
    } else if (payment.provider === "MERCADOPAGO") {
      providerIdentifier = payment.mpPaymentId
        ? String(payment.mpPaymentId)
        : null;
    }
    if (!providerIdentifier) {
      throw new AppError("Pagamento sem identificação no provedor", 400);
    }

    const refund = await prisma.refund.create({
      data: {
        paymentId: payment.id,
        barbershopId: payment.barbershopId,
        amount: Math.round(payment.transactionAmount),
        reason,
        status: "PENDING",
        provider: payment.provider,
        requestedById: admin.id,
      },
    });

    try {
      let providerResponse: { refundId: string; status: string; raw: unknown };

      if (payment.provider === "ABACATEPAY") {
        const res = await this.abacateService.refundCheckout(
          providerIdentifier,
          reason
        );
        providerResponse = { ...res, raw: res };
      } else if (payment.provider === "ASAAS") {
        const res = await this.asaasService.refundPayment(providerIdentifier);
        providerResponse = {
          refundId: res.id,
          status: res.status,
          raw: res,
        };
      } else {
        const res = await this.mpService.refundPayment(providerIdentifier);
        providerResponse = {
          refundId: String(res.id),
          status: res.status,
          raw: res,
        };
      }

      const subscription = await prisma.subscription.findUnique({
        where: { barbershopId: payment.barbershopId },
        select: { id: true, status: true },
      });

      const invoiceMatch = payment.externalReference?.match(
        INVOICE_REFERENCE_PATTERN
      );

      const transaction: Prisma.PrismaPromise<unknown>[] = [
        prisma.refund.update({
          where: { id: refund.id },
          data: {
            status: "SUCCEEDED",
            providerRefundId: providerResponse.refundId,
            completedAt: new Date(),
          },
        }),
        prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: "refunded",
            statusDetail: "refunded_by_admin",
            rawResponse: JSON.stringify(providerResponse.raw),
          },
        }),
        prisma.invoice.updateMany({
          where: {
            subscriptionId: subscription?.id ?? "",
            status: { in: ["PENDING", "OVERDUE"] },
          },
          data: { status: "CANCELLED" },
        }),
      ];

      if (invoiceMatch) {
        transaction.push(
          prisma.invoice.update({
            where: { id: invoiceMatch[2] },
            data: { status: "CANCELLED" },
          })
        );
      }

      await prisma.$transaction(transaction);

      if (subscription) {
        await cancelSubscriptionForBarbershop(payment.barbershopId, {
          revokeImmediately: true,
        }).catch((err) => {
          console.warn(
            `[RefundPayment] Falha ao cancelar assinatura ${subscription.id}:`,
            err?.message ?? err
          );
        });
      }

      invalidateSubscriptionCache(payment.barbershopId);

      await revokeReferralOnCancellation(payment.barbershopId).catch((err) => {
        console.warn(
          `[RefundPayment] Falha ao reverter indicação:`,
          err?.message ?? err
        );
      });

      await prisma.adminNotification
        .create({
          data: {
            type: "PAYMENT_REFUNDED",
            title: "Pagamento reembolsado",
            message: `Pagamento ${payment.id} reembolsado (R$ ${payment.transactionAmount}). Barbearia: ${payment.barbershopId}.`,
            metadata: JSON.stringify({
              paymentId: payment.id,
              refundId: refund.id,
              barbershopId: payment.barbershopId,
              amount: payment.transactionAmount,
              provider: payment.provider,
              reason,
            }),
          },
        })
        .catch(() => {});

      await prisma.auditLog
        .create({
          data: {
            userId: admin.id,
            action: "REFUND_PAYMENT",
            resource: "Payment",
            resourceId: payment.id,
            details: JSON.stringify({
              refundId: refund.id,
              barbershopId: payment.barbershopId,
              amount: payment.transactionAmount,
              provider: payment.provider,
              reason,
            }),
          },
        })
        .catch(() => {});

      return prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    } catch (error: any) {
      const message =
        error instanceof AppError
          ? error.message
          : error?.message ?? "Erro desconhecido";

      await prisma.refund
        .update({
          where: { id: refund.id },
          data: { status: "FAILED", errorMessage: message },
        })
        .catch(() => {});

      throw new AppError(message, 422);
    }
  }
}