import { inject, injectable } from "tsyringe";
import { MercadoPagoService } from "../../services/MercadoPagoService";
import { IPaymentRepository } from "../../repositories/IPaymentRepository";
import { IMercadoPagoWebhookDTO, PaymentStatus } from "../../dtos/IPaymentDTO";

@injectable()
export class ProcessWebhookUseCase {
  constructor(
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository,
    @inject("MercadoPagoService")
    private mpService: MercadoPagoService
  ) {}

  async execute(payload: IMercadoPagoWebhookDTO): Promise<void> {
    if (payload.type !== "payment") return;

    const mpPaymentIdStr = String(payload.data.id);
    if (!mpPaymentIdStr || mpPaymentIdStr === "0") return;

    let mpData: Awaited<ReturnType<MercadoPagoService["getPaymentById"]>>;

    try {
      mpData = await this.mpService.getPaymentById(mpPaymentIdStr);
    } catch (err: any) {
      console.warn(
        `[ProcessWebhook] Falha ao buscar mpPaymentId=${mpPaymentIdStr} no Mercado Pago: ${err?.message ?? err}`
      );
      return;
    }

    // BUG-2: findByMpPaymentId agora recebe string
    const localPayment = await this.paymentRepo.findByMpPaymentId(mpPaymentIdStr);
    if (!localPayment) return;

    if (localPayment.status === (mpData.status as PaymentStatus)) return;

    await this.paymentRepo.updateStatus(localPayment.id, {
      status: mpData.status as PaymentStatus,
      statusDetail: mpData.status_detail,
      rawResponse: JSON.stringify(mpData)
    });
  }
}
