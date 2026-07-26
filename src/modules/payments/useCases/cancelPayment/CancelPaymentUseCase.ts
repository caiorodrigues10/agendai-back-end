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

  async execute(
    id: string,
    requestingUser?: { role: string; barbershopId?: string }
  ): Promise<IPaymentResponseDTO> {
    const payment = await this.paymentRepo.findById(id);

    if (!payment) {
      throw new AppError("Pagamento não encontrado", 404);
    }

    // Ownership check — somente MASTER_ADMIN e OWNER podem cancelar pagamentos
    if (requestingUser && requestingUser.role === "EMPLOYEE") {
      throw new AppError("Acesso negado: apenas proprietários podem cancelar pagamentos", 403);
    }
    if (
      requestingUser &&
      requestingUser.role !== "MASTER_ADMIN" &&
      payment.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    // FIX-1: "cancelled" retorna idempotentemente em vez de 400
    if (payment.status === "cancelled") {
      return payment;
    }

    const cancellableStatuses = ["pending", "in_process", "authorized"];
    if (!cancellableStatuses.includes(payment.status)) {
      throw new AppError(
        `Pagamento com status "${payment.status}" não pode ser cancelado`,
        400
      );
    }

    if (payment.provider === "ABACATEPAY" || !payment.mpPaymentId) {
      // Cancelamento remoto AbacatePay ainda não suportado — só marca local
      return this.paymentRepo.updateStatus(payment.id, {
        status: "cancelled",
        statusDetail: "cancelled_locally",
      });
    }

    let mpResponse: Awaited<ReturnType<MercadoPagoService["cancelPayment"]>>;

    try {
      // FIX-4: passa string diretamente — sem Number()
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
