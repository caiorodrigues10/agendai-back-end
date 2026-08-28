import { inject, injectable } from "tsyringe";
import { MercadoPagoService } from "../../services/MercadoPagoService";
import { IPaymentRepository } from "../../repositories/IPaymentRepository";
import { IMercadoPagoWebhookDTO, PaymentStatus } from "../../dtos/IPaymentDTO";
import { handleSubscriptionPaymentWebhook } from "@/modules/subscriptions/services/handleSubscriptionPaymentWebhook";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("process-webhook");

@injectable()
export class ProcessWebhookUseCase {
  constructor(
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository,
    @inject("MercadoPagoService")
    private mpService: MercadoPagoService
  ) { }

  async execute(payload: IMercadoPagoWebhookDTO): Promise<void> {
    if (payload.type !== "payment") return;

    const mpPaymentIdStr = String(payload.data.id);
    if (!mpPaymentIdStr || mpPaymentIdStr === "0") return;

    let mpData: Awaited<ReturnType<MercadoPagoService["getPaymentById"]>>;

    try {
      mpData = await this.mpService.getPaymentById(mpPaymentIdStr);
    } catch (err: any) {
      logger.error({ err, mpPaymentId: mpPaymentIdStr }, "Falha ao buscar pagamento no Mercado Pago");
      return;
    }

    const localPayment = await this.paymentRepo.findByMpPaymentId(mpPaymentIdStr);
    if (!localPayment) return;

    if (localPayment.status === (mpData.status as PaymentStatus)) return;

    const updatedPayment = await this.paymentRepo.updateStatus(localPayment.id, {
      status: mpData.status as PaymentStatus,
      statusDetail: mpData.status_detail,
      rawResponse: JSON.stringify(mpData)
    });

    // Atualiza Invoice + Subscription se for pagamento de assinatura
    await handleSubscriptionPaymentWebhook(
      updatedPayment.externalReference,
      mpData.status
    ).catch((err) => {
      logger.error({ err, externalReference: updatedPayment.externalReference }, "Falha ao atualizar subscription");
    });
  }
}