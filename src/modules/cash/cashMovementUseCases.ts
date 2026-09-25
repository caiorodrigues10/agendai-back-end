import { AppError } from "@/shared/errors/AppError";
import {
  CashMovementRepository,
  CreateCashMovementData,
} from "./cashMovementRepository";
import { DailyCloseoutRepository } from "@/modules/financial/dailyCloseoutRepository";

export class CashMovementUseCases {
  private repo = new CashMovementRepository();
  private closeoutRepo = new DailyCloseoutRepository();

  async registerMovement(
    barbershopId: string,
    userId: string,
    data: CreateCashMovementData
  ) {
    if (!barbershopId) throw new AppError("barbershopId is required", 400);

    return this.repo.create({
      ...data,
      barbershopId,
      createdBy: userId,
    });
  }

  async getDailySummary(barbershopId: string, date: Date) {
    return this.repo.getSummary(barbershopId, date);
  }

  async listMovements(barbershopId: string, filters: { date?: Date; paymentMethod?: string; type?: string }) {
    return this.repo.list(barbershopId, filters);
  }

  async closeDay(barbershopId: string, date: Date, userId: string, declared: {
    cashReceived: number;
    pixReceived: number;
    cardReceived: number;
    balanceOpen: number;
  }) {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    const startOfDay = new Date(normalizedDate);
    const endOfDay = new Date(normalizedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const movements = await this.repo.list(barbershopId, { date: normalizedDate });

    let cashTotal = 0;
    let pixTotal = 0;
    let cardTotal = 0;
    let fiadoTotal = 0;

    for (const m of movements) {
      const amt = Number(m.amount);
      const isIn = ["SERVICE_SALE", "PRODUCT_SALE", "PACKAGE_SALE", "FIADO_PAYMENT", "TIP", "OTHER"].includes(m.type);
      const signed = isIn ? amt : -amt;

      switch (m.paymentMethod) {
        case "CASH":
          cashTotal += signed;
          break;
        case "PIX":
          pixTotal += signed;
          break;
        case "CREDIT_CARD":
        case "DEBIT_CARD":
          cardTotal += signed;
          break;
        case "FIADO":
          fiadoTotal += signed;
          break;
      }
    }

    const cashDiscrepancy = declared.cashReceived - cashTotal;

    const closeout = await this.closeoutRepo.upsert(barbershopId, normalizedDate, {
      balanceOpen: declared.balanceOpen,
      cashReceived: declared.cashReceived,
      pixReceived: declared.pixReceived,
      cardReceived: declared.cardReceived,
      fiadoCreated: fiadoTotal > 0 ? fiadoTotal : 0,
      fiadoPaid: fiadoTotal < 0 ? Math.abs(fiadoTotal) : 0,
      expenses: 0,
      commissions: 0,
      productSales: 0,
      discrepancy: cashDiscrepancy !== 0 ? cashDiscrepancy : null,
      closedBy: userId,
      closedAt: new Date(),
    });

    return { closeout, cashTotal, pixTotal, cardTotal, fiadoTotal, cashDiscrepancy };
  }
}
