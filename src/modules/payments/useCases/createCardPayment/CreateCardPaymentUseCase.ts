import { inject, injectable } from "tsyringe";
import { MercadoPagoService } from "../../services/MercadoPagoService";
import { IPaymentRepository } from "../../repositories/IPaymentRepository";
import { ICreateCardPaymentDTO, IPaymentResponseDTO, PaymentMethod } from "../../dtos/IPaymentDTO";
import { AppError } from "@/shared/errors/AppError";

@injectable()
export class CreateCardPaymentUseCase {
  constructor(
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository,
    @inject("MercadoPagoService")
    private mpService: MercadoPagoService
  ) {}

  async execute(
    data: ICreateCardPaymentDTO,
    requestingUser?: { role: string; barbershopId?: string }
  ): Promise<IPaymentResponseDTO> {
    if (data.transactionAmount < 0.5) {
      throw new AppError("O valor mínimo de pagamento é R$ 0,50", 400);
    }

    // IMP-1: Garante que não-admins só criem pagamentos para sua própria barbearia
    if (
      requestingUser &&
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    let mpResponse: Awaited<ReturnType<MercadoPagoService["createCardPayment"]>>;

    try {
      mpResponse = await this.mpService.createCardPayment(
        data,
        data.barbershopId,
        data.serviceId,
        data.appointmentId,
        data.queueItemId
      );
    } catch (error: any) {
      throw new AppError(
        `Pagamento recusado: ${error.message ?? "Erro desconhecido"}`,
        422
      );
    }

    const paymentMethod: PaymentMethod =
      mpResponse.payment_type_id === "debit_card" ? "debit_card" : "credit_card";

    return this.paymentRepo.create({
      mpPaymentId: mpResponse.id,
      status: mpResponse.status as any,
      statusDetail: mpResponse.status_detail,
      paymentMethod,
      transactionAmount: mpResponse.transaction_amount,
      currency: mpResponse.currency_id,
      description: mpResponse.description || data.description,
      barbershopId: data.barbershopId,
      serviceId: data.serviceId,
      appointmentId: data.appointmentId,
      queueItemId: data.queueItemId,
      externalReference: mpResponse.external_reference,
      rawResponse: JSON.stringify(mpResponse)
    });
  }
}
