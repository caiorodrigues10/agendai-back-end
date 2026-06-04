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

    const mpPaymentId = Number(payload.data.id);
    if (!mpPaymentId || isNaN(mpPaymentId)) return;

    let mpData: Awaited<ReturnType<MercadoPagoService["getPaymentById"]>>;

    try {
      mpData = await this.mpService.getPaymentById(mpPaymentId);
    } catch {
      return;
    }

    const localPayment = await this.paymentRepo.findByMpPaymentId(mpPaymentId);
    if (!localPayment) return;

    if (localPayment.status === (mpData.status as PaymentStatus)) return;

    await this.paymentRepo.updateStatus(localPayment.id, {
      status: mpData.status as PaymentStatus,
      statusDetail: mpData.status_detail,
      rawResponse: JSON.stringify(mpData)
    });
  }
}
