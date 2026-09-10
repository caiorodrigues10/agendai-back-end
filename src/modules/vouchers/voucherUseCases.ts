import { VoucherRepository } from "./voucherRepository";
import { AppError } from "@/shared/errors/AppError";
import type { z } from "zod";
import type {
  createVoucherSchema,
  updateVoucherSchema,
  validateVoucherSchema,
  applyVoucherSchema,
} from "./voucherSchema";

type CreateInput = z.infer<typeof createVoucherSchema>;
type UpdateInput = z.infer<typeof updateVoucherSchema>;
type ValidateInput = z.infer<typeof validateVoucherSchema>;
type ApplyInput = z.infer<typeof applyVoucherSchema>;

interface ValidationResult {
  voucherId: string;
  code: string;
  type: string;
  value: number;
  applicable: boolean;
  reason?: string;
}

interface ApplyResult {
  voucherId: string;
  code: string;
  discountAmount: number;
  finalAmount: number;
}

export class VoucherUseCases {
  private repo = new VoucherRepository();

  async listVouchers(barbershopId: string, activeOnly = false) {
    return this.repo.listByBarbershop(barbershopId, activeOnly);
  }

  async getById(id: string) {
    const voucher = await this.repo.findById(id);
    if (!voucher) throw new AppError("Voucher não encontrado", 404);
    return voucher;
  }

  async create(barbershopId: string, data: CreateInput) {
    return this.repo.create(barbershopId, data);
  }

  async update(id: string, barbershopId: string, data: UpdateInput) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Voucher não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.update(id, data);
  }

  async delete(id: string, barbershopId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Voucher não encontrado", 404);
    if (existing.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }
    return this.repo.delete(id);
  }

  async validateCode(barbershopId: string, input: ValidateInput): Promise<ValidationResult> {
    const code = input.code.toUpperCase();
    const voucher = await this.repo.findByCode(barbershopId, code);

    if (!voucher) {
      return { voucherId: "", code, type: "", value: 0, applicable: false, reason: "Cupom não encontrado" };
    }

    if (!voucher.isActive) {
      return { voucherId: voucher.id, code: voucher.code, type: voucher.type, value: voucher.value, applicable: false, reason: "Cupom está inativo" };
    }

    const now = new Date();
    if (now < voucher.startAt) {
      return { voucherId: voucher.id, code: voucher.code, type: voucher.type, value: voucher.value, applicable: false, reason: "Cupom ainda não está válido" };
    }
    if (now > voucher.endAt) {
      return { voucherId: voucher.id, code: voucher.code, type: voucher.type, value: voucher.value, applicable: false, reason: "Cupom expirado" };
    }

    if (voucher.maxUses !== null && voucher.usedCount >= voucher.maxUses) {
      return { voucherId: voucher.id, code: voucher.code, type: voucher.type, value: voucher.value, applicable: false, reason: "Cupom atingiu o limite de uso" };
    }

    if (input.clientId && input.serviceId) {
      const serviceIds = voucher.applicableServiceIds as string[] | null;
      if (serviceIds && serviceIds.length > 0 && !serviceIds.includes(input.serviceId)) {
        return { voucherId: voucher.id, code: voucher.code, type: voucher.type, value: voucher.value, applicable: false, reason: "Cupom não aplicável a este serviço" };
      }
    }

    if (input.clientId) {
      const clientUsages = await this.repo.countClientUsages(voucher.id, input.clientId);
      if (clientUsages >= voucher.perClientLimit) {
        return { voucherId: voucher.id, code: voucher.code, type: voucher.type, value: voucher.value, applicable: false, reason: "Cupom já atingiu o limite por cliente" };
      }
    }

    return { voucherId: voucher.id, code: voucher.code, type: voucher.type, value: voucher.value, applicable: true };
  }

  async applyVoucher(barbershopId: string, input: ApplyInput): Promise<ApplyResult> {
    const voucher = await this.repo.findById(input.voucherId);
    if (!voucher) throw new AppError("Voucher não encontrado", 404);
    if (voucher.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);

    if (!voucher.isActive) throw new AppError("Voucher está inativo", 400);

    const now = new Date();
    if (now < voucher.startAt || now > voucher.endAt) {
      throw new AppError("Cupom fora do período de validade", 400);
    }

    if (voucher.maxUses !== null && voucher.usedCount >= voucher.maxUses) {
      throw new AppError("Cupom atingiu o limite de uso", 400);
    }

    if (voucher.minPurchase !== null && input.originalAmount < voucher.minPurchase) {
      throw new AppError(`Valor mínimo de compra: R$ ${voucher.minPurchase.toFixed(2)}`, 400);
    }

    if (input.clientId) {
      const clientUsages = await this.repo.countClientUsages(voucher.id, input.clientId);
      if (clientUsages >= voucher.perClientLimit) {
        throw new AppError("Cupom já atingiu o limite por cliente", 400);
      }
    }

    let discountAmount = 0;

    switch (voucher.type) {
      case "PERCENT":
        discountAmount = input.originalAmount * (voucher.value / 100);
        break;
      case "FIXED":
        discountAmount = Math.min(voucher.value, input.originalAmount);
        break;
      case "FREE_SERVICE":
        discountAmount = input.originalAmount;
        break;
      case "BUY_X_GET_Y":
        discountAmount = voucher.value;
        break;
    }

    discountAmount = Math.round(discountAmount * 100) / 100;
    discountAmount = Math.min(discountAmount, input.originalAmount);

    const finalAmount = Math.round((input.originalAmount - discountAmount) * 100) / 100;

    await this.repo.recordUsage(voucher.id, input.clientId ?? null, input.appointmentId ?? null, discountAmount);
    await this.repo.incrementUsedCount(voucher.id);

    return {
      voucherId: voucher.id,
      code: voucher.code,
      discountAmount,
      finalAmount,
    };
  }

  async getUsages(barbershopId: string, voucherId: string) {
    const voucher = await this.repo.findById(voucherId);
    if (!voucher) throw new AppError("Voucher não encontrado", 404);
    if (voucher.barbershopId !== barbershopId) throw new AppError("Acesso negado", 403);

    return this.repo.getUsages(voucherId);
  }
}
