import { inject, injectable } from "tsyringe";
import { IPaymentRepository } from "../../repositories/IPaymentRepository";
import { AbacatePayService } from "../../services/AbacatePayService";
import { handleSubscriptionPaymentWebhook } from "@/modules/subscriptions/services/handleSubscriptionPaymentWebhook";

export interface IAbacateWebhookPayload {
  id?: string;
  event?: string;
  apiVersion?: number;
  devMode?: boolean;
  data?: {
    id?: string;
    externalId?: string | null;
    status?: string;
    amount?: number;
    paidAmount?: number;
    checkout?: {
      id?: string;
      externalId?: string | null;
      status?: string;
      amount?: number;
      paidAmount?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

function allowDevModeWebhooks(): boolean {
  return (
    process.env.ALLOW_INSECURE_WEBHOOKS === "true" ||
    process.env.ABACATEPAY_ALLOW_DEV_MODE === "true"
  );
}

function skipApiVerification(): boolean {
  return process.env.ALLOW_INSECURE_WEBHOOKS === "true";
}

@injectable()
export class ProcessAbacateWebhookUseCase {
  constructor(
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository,
    @inject("AbacatePayService")
    private abacatePay: AbacatePayService
  ) {}

  async execute(payload: IAbacateWebhookPayload): Promise<void> {
    const event = payload.event;
    if (!event) return;

    if (payload.devMode === true && !allowDevModeWebhooks()) {
      throw new Error(
        "DEV_MODE_REJECTED: webhook AbacatePay em devMode rejeitado. " +
          "Use ambiente real ou defina ABACATEPAY_ALLOW_DEV_MODE=true / ALLOW_INSECURE_WEBHOOKS=true."
      );
    }

    if (event === "checkout.completed") {
      await this.handleCheckoutCompleted(payload);
      return;
    }

    if (
      event === "checkout.refunded" ||
      event === "checkout.lost" ||
      event === "checkout.disputed"
    ) {
      await this.handleCheckoutNegative(payload, event);
    }
  }

  private extractCheckoutId(payload: IAbacateWebhookPayload): string | null {
    const nested = payload.data?.checkout?.id;
    if (nested) return String(nested);
    if (payload.data?.id) return String(payload.data.id);
    return null;
  }

  private extractExternalId(payload: IAbacateWebhookPayload): string | null {
    const nested = payload.data?.checkout?.externalId;
    if (nested) return String(nested);
    if (payload.data?.externalId) return String(payload.data.externalId);
    return null;
  }

  private async resolveLocalPayment(payload: IAbacateWebhookPayload) {
    const billId = this.extractCheckoutId(payload);
    const externalId = this.extractExternalId(payload);

    if (billId) {
      const byProvider = await this.paymentRepo.findByProviderPaymentId(billId);
      if (byProvider) return byProvider;
    }
    if (externalId) {
      return this.paymentRepo.findByExternalReference(externalId);
    }
    return null;
  }

  /**
   * Confirma no painel AbacatePay que o checkout está pago e o valor bate
   * com o Payment local (tolerância de 1 centavo).
   */
  private async assertCheckoutPaidAgainstApi(
    localPayment: { transactionAmount: number; providerPaymentId: string | null },
    checkoutId: string
  ): Promise<void> {
    if (skipApiVerification()) return;

    const remote = await this.abacatePay.getCheckout(checkoutId);

    if (remote.devMode === true && !allowDevModeWebhooks()) {
      throw new Error(
        `CHECKOUT_UNVERIFIED: checkout ${checkoutId} está em devMode (rejeitado em produção)`
      );
    }

    const status = String(remote.status ?? "").toUpperCase();
    if (status !== "PAID" && status !== "COMPLETE" && status !== "COMPLETED") {
      throw new Error(
        `CHECKOUT_UNVERIFIED: status remoto "${remote.status}" (esperado PAID) para ${checkoutId}`
      );
    }

    const paidCents =
      typeof remote.paidAmount === "number"
        ? remote.paidAmount
        : typeof remote.amount === "number"
          ? remote.amount
          : null;

    if (paidCents == null) return;

    const expectedCents = Math.round(Number(localPayment.transactionAmount) * 100);
    if (Math.abs(paidCents - expectedCents) > 1) {
      throw new Error(
        `CHECKOUT_UNVERIFIED: valor remoto ${paidCents}¢ ≠ local ${expectedCents}¢ (${checkoutId})`
      );
    }
  }

  private async handleCheckoutCompleted(
    payload: IAbacateWebhookPayload
  ): Promise<void> {
    const localPayment = await this.resolveLocalPayment(payload);
    if (!localPayment) return;

    if (localPayment.status === "approved") return;

    const checkoutId =
      this.extractCheckoutId(payload) ?? localPayment.providerPaymentId;
    if (!checkoutId) {
      throw new Error("CHECKOUT_UNVERIFIED: checkout id ausente no webhook");
    }

    await this.assertCheckoutPaidAgainstApi(localPayment, checkoutId);

    const updated = await this.paymentRepo.updateStatus(localPayment.id, {
      status: "approved",
      statusDetail: "checkout.completed",
      rawResponse: JSON.stringify(payload),
    });

    await handleSubscriptionPaymentWebhook(
      updated.externalReference,
      "approved"
    ).catch((err) => {
      console.error(
        `[ProcessAbacateWebhook] Falha ao atualizar subscription: ${err?.message ?? err}`
      );
    });
  }

  private async handleCheckoutNegative(
    payload: IAbacateWebhookPayload,
    event: string
  ): Promise<void> {
    const localPayment = await this.resolveLocalPayment(payload);
    if (!localPayment) return;

    const status =
      event === "checkout.refunded"
        ? "refunded"
        : event === "checkout.lost"
          ? "charged_back"
          : "in_mediation";

    const updated = await this.paymentRepo.updateStatus(localPayment.id, {
      status,
      statusDetail: event,
      rawResponse: JSON.stringify(payload),
    });

    await handleSubscriptionPaymentWebhook(
      updated.externalReference,
      status
    ).catch((err) => {
      console.error(
        `[ProcessAbacateWebhook] Falha ao atualizar subscription: ${err?.message ?? err}`
      );
    });
  }
}
