import { inject, injectable } from "tsyringe";
import { MercadoPagoService } from "../../services/MercadoPagoService";
import { AsaasService } from "../../services/AsaasService";
import { IPaymentRepository } from "../../repositories/IPaymentRepository";
import { IPaymentResponseDTO, PaymentStatus } from "../../dtos/IPaymentDTO";
import { AppError } from "@/shared/errors/AppError";

@injectable()
export class GetPaymentStatusUseCase {
  constructor(
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository,
    @inject("MercadoPagoService")
    private mpService: MercadoPagoService,
    @inject("AsaasService")
    private asaasService: AsaasService
  ) {}

  async execute(
    id: string,
    syncWithMp = false,
    logger?: { warn: (msg: string, ...args: any[]) => void },
    requestingUser?: { role: string; barbershopId?: string }
  ): Promise<IPaymentResponseDTO> {
    const payment = await this.paymentRepo.findById(id);

    if (!payment) {
      throw new AppError("Pagamento não encontrado", 404);
    }

    // Ownership check — não-admins só podem consultar pagamentos da própria barbearia
    if (
      requestingUser &&
      requestingUser.role !== "MASTER_ADMIN" &&
      payment.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    const shouldSync =
      (payment.provider === "MERCADOPAGO" &&
        payment.mpPaymentId != null &&
        (syncWithMp || ["pending", "in_process"].includes(payment.status))) ||
      (payment.provider === "ASAAS" &&
        payment.providerPaymentId != null &&
        (syncWithMp || ["pending", "in_process"].includes(payment.status)));

    if (payment.provider === "ASAAS" && payment.providerPaymentId) {
      try {
        const asaasData = await this.asaasService.getPayment(
          payment.providerPaymentId
        );
        const mapped = this.asaasService.mapStatusToLocal(asaasData.status);
        if (mapped !== payment.status) {
          return this.paymentRepo.updateStatus(payment.id, {
            status: mapped,
            statusDetail: asaasData.status,
            rawResponse: JSON.stringify(asaasData),
          });
        }
      } catch (err: any) {
        const msg = `[GetPaymentStatus] Falha ao sincronizar providerPaymentId=${payment.providerPaymentId} com Asaas: ${err?.message ?? err}`;
        if (logger) {
          logger.warn(msg);
        } else {
          console.warn(msg);
        }
      }
    } else if (shouldSync && payment.mpPaymentId) {
      try {
        // FIX-4: passa string diretamente — sem Number(), sem risco de truncamento
        const mpData = await this.mpService.getPaymentById(payment.mpPaymentId);
        if (mpData.status !== payment.status) {
          return this.paymentRepo.updateStatus(payment.id, {
            status: mpData.status as PaymentStatus,
            statusDetail: mpData.status_detail,
            rawResponse: JSON.stringify(mpData)
          });
        }
      } catch (err: any) {
        // IMP-4: loga em vez de silenciar completamente
        const msg = `[GetPaymentStatus] Falha ao sincronizar mpPaymentId=${payment.mpPaymentId} com Mercado Pago: ${err?.message ?? err}`;
        if (logger) {
          logger.warn(msg);
        } else {
          console.warn(msg);
        }
      }
    }

    return payment;
  }
}
