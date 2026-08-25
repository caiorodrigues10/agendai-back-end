import { inject, injectable } from "tsyringe";
import { IPaymentRepository } from "../../repositories/IPaymentRepository";
import { AsaasService } from "../../services/AsaasService";
import { handleSubscriptionPaymentWebhook } from "@/modules/subscriptions/services/handleSubscriptionPaymentWebhook";

export interface IAsaasWebhookPayload {
  event?: string;
  payment?: {
    id?: string;
    status?: string;
    externalReference?: string | null;
    value?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Processa eventos de cobranças do Asaas:
 * PAYMENT_CONFIRMED / PAYMENT_RECEIVED → approved
 * PAYMENT_OVERDUE / PAYMENT_DELETED → cancelled (PAST_DUE local)
 * PAYMENT_REFUNDED → refunded
 * PAYMENT_CHARGEBACK_REQUESTED → charged_back
 * PAYMENT_CHARGEBACK_DISPUTE / PAYMENT_AWAITING_CHARGEBACK_REVERSAL → in_mediation
 */
@injectable()
export class ProcessAsaasWebhookUseCase {
  constructor(
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository,
    @inject("AsaasService")
    private asaasService: AsaasService
  ) {}

  async execute(payload: IAsaasWebhookPayload): Promise<void> {
    const event = payload.event;
    if (!event) return;

    const localStatus = this.asaasService.mapEventToLocalStatus(event);
    if (!localStatus) return;

    const localPayment = await this.resolveLocalPayment(payload);
    if (!localPayment) return;

    // Guarda: PAYMENT_REFUNDED após refund proporcional/admin já refletido
    // localmente (payment marcado "refunded") — não pode regredir a assinatura.
    if (localStatus === "refunded" && localPayment.status === "refunded") return;

    // Idempotência: pagamento já aprovado não reprocessa a assinatura.
    if (localStatus === "approved" && localPayment.status === "approved") return;

    const updated = await this.paymentRepo.updateStatus(localPayment.id, {
      status: localStatus,
      statusDetail: event,
      rawResponse: JSON.stringify(payload),
    });

    await handleSubscriptionPaymentWebhook(
      updated.externalReference,
      localStatus
    );
  }

  private async resolveLocalPayment(
    payload: IAsaasWebhookPayload
  ): Promise<Awaited<ReturnType<IPaymentRepository["findByProviderPaymentId"]>>> {
    const providerId = payload.payment?.id
      ? String(payload.payment.id)
      : null;

    if (providerId) {
      const byProvider = await this.paymentRepo.findByProviderPaymentId(
        providerId
      );
      if (byProvider) return byProvider;
    }

    const externalId = payload.payment?.externalReference
      ? String(payload.payment.externalReference)
      : null;
    if (externalId) {
      return this.paymentRepo.findByExternalReference(externalId);
    }

    return null;
  }
}