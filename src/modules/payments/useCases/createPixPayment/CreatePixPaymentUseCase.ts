import { injectable } from "tsyringe";
import { MercadoPagoService } from "../../services/MercadoPagoService";
import { PaymentRepository } from "../../repositories/infra/repositories/PaymentRepository"
import { ICreatePixPaymentDTO, IPaymentResponseDTO } from "../../dtos/IPaymentDTO";
import { AppError } from "@/shared/errors/AppError";

@injectable()
export class CreatePixPaymentUseCase {
  private mpService: MercadoPagoService;
  private paymentRepo: PaymentRepository;

  constructor() {
    this.mpService = new MercadoPagoService();
    this.paymentRepo = new PaymentRepository();
  }

  async execute(data: ICreatePixPaymentDTO): Promise<IPaymentResponseDTO> {
    if (data.transactionAmount < 0.5) {
      throw new AppError("O valor mínimo de pagamento é R$ 0,50", 400);
    }

    let mpResponse: Awaited<ReturnType<MercadoPagoService["createPixPayment"]>>;

    try {
      mpResponse = await this.mpService.createPixPayment(data);
    } catch (error: any) {
      throw new AppError(
        `Erro ao gerar PIX: ${error.message ?? "Erro desconhecido"}`,
        422
      );
    }

    const txData = mpResponse.point_of_interaction?.transaction_data;

    if (!txData?.qr_code) {
      throw new AppError(
        "Mercado Pago não retornou QR Code PIX. Verifique a conta MP.",
        502
      );
    }

    const payment = await this.paymentRepo.create({
      mpPaymentId: mpResponse.id,
      status: mpResponse.status as any,
      statusDetail: mpResponse.status_detail,
      paymentMethod: "pix",
      transactionAmount: mpResponse.transaction_amount,
      currency: mpResponse.currency_id,
      description: mpResponse.description || data.description,
      barbershopId: data.barbershopId,
      serviceId: data.serviceId,
      appointmentId: data.appointmentId,
      queueItemId: data.queueItemId,
      externalReference: mpResponse.external_reference,
      pixQrCode: txData.qr_code,
      pixQrCodeBase64: txData.qr_code_base64,
      pixExpirationDate: mpResponse.date_of_expiration
        ? new Date(mpResponse.date_of_expiration)
        : null,
      rawResponse: JSON.stringify(mpResponse)
    });

    return payment;
  }
}