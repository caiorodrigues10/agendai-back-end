import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IFiadoRepository } from "../repositories/IFiadoRepository";
import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import {
  ICreateFiadoDTO,
  ICreateFiadoPaymentDTO,
  IUpdateFiadoDTO,
  IFiadoResponseDTO,
  IFiadoListQuery,
  IFiadoSummary,
  IFiadoPaymentResponseDTO,
} from "../dtos/IFiadoDTO";

// ─── Create ───────────────────────────────────────────────────────────────────

@injectable()
export class CreateFiadoUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) { }

  async execute(
    data: ICreateFiadoDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IFiadoResponseDTO> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    return this.fiadoRepository.create(data);
  }
}

// ─── Get ──────────────────────────────────────────────────────────────────────

@injectable()
export class GetFiadoUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) { }

  async execute(
    id: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IFiadoResponseDTO> {
    const fiado = await this.fiadoRepository.findById(id);
    if (!fiado) throw new AppError("Fiado não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      fiado.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    return fiado;
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

@injectable()
export class ListFiadosUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) { }

  async execute(
    query: IFiadoListQuery & { barbershopId: string },
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<{ data: IFiadoResponseDTO[]; total: number }> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      query.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    return this.fiadoRepository.list(query);
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

@injectable()
export class UpdateFiadoUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) { }

  async execute(
    id: string,
    data: IUpdateFiadoDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IFiadoResponseDTO> {
    const fiado = await this.fiadoRepository.findById(id);
    if (!fiado) throw new AppError("Fiado não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      fiado.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    if (fiado.status === "PAID" && data.status !== "FORGIVEN") {
      throw new AppError("Fiado já quitado não pode ser editado", 400);
    }

    return this.fiadoRepository.update(id, data);
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

@injectable()
export class DeleteFiadoUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) { }

  async execute(
    id: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<void> {
    const fiado = await this.fiadoRepository.findById(id);
    if (!fiado) throw new AppError("Fiado não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      fiado.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    await this.fiadoRepository.delete(id);
  }
}

// ─── Add Payment ──────────────────────────────────────────────────────────────

@injectable()
export class AddFiadoPaymentUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) { }

  async execute(
    data: ICreateFiadoPaymentDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IFiadoPaymentResponseDTO> {
    const fiado = await this.fiadoRepository.findById(data.fiadoId);
    if (!fiado) throw new AppError("Fiado não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      fiado.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    if (fiado.status === "PAID" || fiado.status === "FORGIVEN") {
      throw new AppError("Este fiado já está encerrado", 400);
    }

    if (data.amount > fiado.remainingAmount) {
      throw new AppError(
        `Valor do pagamento (R$${data.amount}) maior que o saldo devedor (R$${fiado.remainingAmount})`,
        400
      );
    }

    return this.fiadoRepository.addPayment(data);
  }
}

export function buildFiadoChargeMessage(
  customerName: string,
  remainingAmount: number,
  description: string,
  payment: { pixKey?: string; cardPaymentLink?: string }
): string {
  const value = remainingAmount.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const methods = [
    payment.pixKey ? `PIX: ${payment.pixKey}` : "",
    payment.cardPaymentLink ? `Cartão: ${payment.cardPaymentLink}` : "",
  ].filter(Boolean);

  return (
    `Olá, ${customerName}! Tudo bem? Ficou pendente o valor de ${value} referente a ${description}. ` +
    `${methods.join(" | ")} Obrigado!`
  );
}

@injectable()
export class ChargeFiadoUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository,
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}

  async execute(
    id: string,
    payment: { pixKey?: string; cardPaymentLink?: string },
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<void> {
    const fiado = await this.fiadoRepository.findById(id);
    if (!fiado) throw new AppError("Fiado não encontrado", 404);
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      fiado.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }
    if (fiado.status === "PAID" || fiado.status === "FORGIVEN") {
      throw new AppError("Este fiado já está encerrado", 400);
    }

    const shop = await this.barbershopRepository.findById(fiado.barbershopId);
    await enqueueWhatsApp({
      phone: fiado.whatsapp,
      message: buildFiadoChargeMessage(
        fiado.customerName,
        fiado.remainingAmount,
        fiado.description,
        payment
      ),
      instanceName: shop?.evolutionInstanceName?.trim() || undefined,
      deduplicationKey: `fiado-charge:${fiado.id}:${Date.now()}`,
    });
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

@injectable()
export class GetFiadoSummaryUseCase {
  constructor(
    @inject("FiadoRepository")
    private fiadoRepository: IFiadoRepository
  ) { }

  async execute(
    barbershopId: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IFiadoSummary> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    return this.fiadoRepository.getSummary(barbershopId);
  }
}
