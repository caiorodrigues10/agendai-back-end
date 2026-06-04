import { inject, injectable } from "tsyringe";
import { MercadoPagoService } from "../../services/MercadoPagoService";
import { IPaymentRepository } from "../../repositories/IPaymentRepository";
import { IPaymentResponseDTO } from "../../dtos/IPaymentDTO";
import { AppError } from "@/shared/errors/AppError";

@injectable()
export class CancelPaymentUseCase {
  constructor(
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository,
    @inject("MercadoPagoService")
    private mpService: MercadoPagoService
  ) {}

  async execute(id: string): Promise<IPaymentResponseDTO> {
    const payment = await this.paymentRepo.findById(id);

    if (!payment) {
      throw new AppError("Pagamento não encontrado", 404);
    }

    const cancellableStatuses = ["pending", "in_process", "authorized"];
    if (!cancellableStatuses.includes(payment.status)) {
      throw new AppError(
        `Pagamento com status "${payment.status}" não pode ser cancelado`,
        400
      );
    }

    let mpResponse: Awaited<ReturnType<MercadoPagoService["cancelPayment"]>>;

    try {
      mpResponse = await this.mpService.cancelPayment(payment.mpPaymentId);
    } catch (error: any) {
      throw new AppError(
        `Erro ao cancelar no Mercado Pago: ${error.message ?? "Erro desconhecido"}`,
        422
      );
    }

    return this.paymentRepo.updateStatus(payment.id, {
      status: mpResponse.status as any,
      statusDetail: mpResponse.status_detail,
      rawResponse: JSON.stringify(mpResponse)
    });
  }
}
