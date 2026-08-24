import { inject, injectable } from "tsyringe";
import { MercadoPagoService } from "../../services/MercadoPagoService";
import { AbacatePayService } from "../../services/AbacatePayService";
import { AsaasService } from "../../services/AsaasService";
import { IPaymentRepository } from "../../repositories/IPaymentRepository";
import { IPaymentResponseDTO } from "../../dtos/IPaymentDTO";
import { AppError } from "@/shared/errors/AppError";

@injectable()
export class CancelPaymentUseCase {
  constructor(
    @inject("PaymentRepository")
    private paymentRepo: IPaymentRepository,
    @inject("MercadoPagoService")
    private mpService: MercadoPagoService,
    @inject("AbacatePayService")
    private abacateService: AbacatePayService,
    @inject("AsaasService")
    private asaasService: AsaasService
  ) {}

  async execute(
    id: string,
    requestingUser?: { role: string; barbershopId?: string }
  ): Promise<IPaymentResponseDTO> {
    const payment = await this.paymentRepo.findById(id);

    if (!payment) {
      throw new AppError("Pagamento não encontrado", 404);
    }

    if (requestingUser && requestingUser.role === "EMPLOYEE") {
      throw new AppError(
        "Acesso negado: apenas proprietários podem cancelar pagamentos",
        403
      );
    }
    if (
      requestingUser &&
      requestingUser.role !== "MASTER_ADMIN" &&
      payment.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

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

    if (payment.provider === "ABACATEPAY") {
      const remoteId = payment.providerPaymentId;
      if (!remoteId) {
        throw new AppError(
          "Pagamento AbacatePay sem identificador remoto — cancelamento bloqueado",
          422
        );
      }
      try {
        const remote = await this.abacateService.cancelCheckout(remoteId);
        // Reconsulta para reduzir divergência
        const confirmed = await this.abacateService
          .getCheckout(remoteId)
          .catch(() => remote);
        return this.paymentRepo.updateStatus(payment.id, {
          status: "cancelled",
          statusDetail: `abacate_${(confirmed.status || "CANCELLED").toLowerCase()}`,
          rawResponse: JSON.stringify(confirmed),
        });
      } catch (error: any) {
        if (error instanceof AppError) throw error;
        console.warn(
          JSON.stringify({
            event: "payment_cancel_remote_failed",
            provider: "ABACATEPAY",
            paymentId: payment.id,
            reason: error?.message ?? "unknown",
          })
        );
        throw new AppError(
          `Falha ao cancelar no AbacatePay: ${error?.message ?? "erro desconhecido"}`,
          503
        );
      }
    }

    if (payment.provider === "ASAAS") {
      const remoteId = payment.providerPaymentId;
      if (!remoteId) {
        throw new AppError(
          "Pagamento Asaas sem identificador remoto — cancelamento bloqueado",
          422
        );
      }
      try {
        await this.asaasService.cancelPayment(remoteId);
        const confirmed = await this.asaasService.getPayment(remoteId).catch(
          () => null
        );
        const mapped = confirmed
          ? this.asaasService.mapStatusToLocal(confirmed.status)
          : "cancelled";
        return this.paymentRepo.updateStatus(payment.id, {
          status: mapped === "cancelled" ? "cancelled" : "cancelled",
          statusDetail: confirmed?.status
            ? `asaas_${confirmed.status.toLowerCase()}`
            : "asaas_deleted",
          rawResponse: confirmed ? JSON.stringify(confirmed) : undefined,
        });
      } catch (error: any) {
        if (error instanceof AppError) throw error;
        console.warn(
          JSON.stringify({
            event: "payment_cancel_remote_failed",
            provider: "ASAAS",
            paymentId: payment.id,
            reason: error?.message ?? "unknown",
          })
        );
        throw new AppError(
          `Falha ao cancelar no Asaas: ${error?.message ?? "erro desconhecido"}`,
          503
        );
      }
    }

    if (!payment.mpPaymentId) {
      throw new AppError(
        "Pagamento sem identificador remoto — cancelamento bloqueado",
        422
      );
    }

    let mpResponse: Awaited<ReturnType<MercadoPagoService["cancelPayment"]>>;

    try {
      mpResponse = await this.mpService.cancelPayment(payment.mpPaymentId);
    } catch (error: any) {
      throw new AppError(
        `Erro ao cancelar no Mercado Pago: ${error.message ?? "Erro desconhecido"}`,
        503
      );
    }

    return this.paymentRepo.updateStatus(payment.id, {
      status: mpResponse.status as any,
      statusDetail: mpResponse.status_detail,
      rawResponse: JSON.stringify(mpResponse),
    });
  }
}
