import { injectable } from "tsyringe";
import { MercadoPagoService } from "../../services/MercadoPagoService";
import { PaymentRepository } from "../../repositories/infra/repositories/PaymentRepository"
import { IPaymentResponseDTO, PaymentStatus } from "../../dtos/IPaymentDTO";
import { AppError } from "@/shared/errors/AppError";

@injectable()
export class GetPaymentStatusUseCase {
  private mpService: MercadoPagoService;
  private paymentRepo: PaymentRepository;

  constructor() {
    this.mpService = new MercadoPagoService();
    this.paymentRepo = new PaymentRepository();
  }

  async execute(id: string, syncWithMp = false): Promise<IPaymentResponseDTO> {
    const payment = await this.paymentRepo.findById(id);

    if (!payment) {
      throw new AppError("Pagamento não encontrado", 404);
    }

    const shouldSync =
      syncWithMp || ["pending", "in_process"].includes(payment.status);

    if (shouldSync) {
      try {
        const mpData = await this.mpService.getPaymentById(payment.mpPaymentId);

        if (mpData.status !== payment.status) {
          return this.paymentRepo.updateStatus(payment.id, {
            status: mpData.status as PaymentStatus,
            statusDetail: mpData.status_detail,
            rawResponse: JSON.stringify(mpData)
          });
        }
      } catch {
        // Silently ignore MP sync errors — retorna status em cache
      }
    }

    return payment;
  }
}