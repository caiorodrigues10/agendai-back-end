import { AppError } from "@/shared/errors/AppError";
import {
  CashMovementRepository,
  CreateCashMovementData,
} from "./cashMovementRepository";
import { DailyCloseoutUseCases, computeDay } from "@/modules/financial/dailyCloseoutUseCases";
import { calendarDateKey } from "@/modules/financial/ledger/shopTime";

export class CashMovementUseCases {
  private repo = new CashMovementRepository();
  private closeoutUseCases = new DailyCloseoutUseCases();

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

    // Mesmo cálculo do fechamento oficial (fonte única = ledger no fuso do salão).
    const figures = await computeDay(barbershopId, calendarDateKey(normalizedDate));
    const closeout = await this.closeoutUseCases.closeDay(barbershopId, normalizedDate, userId, {
      balanceOpen: declared.balanceOpen,
      cashReceived: declared.cashReceived,
      pixReceived: declared.pixReceived,
      cardReceived: declared.cardReceived,
    });

    const cashDiscrepancy = Math.round(
      (declared.cashReceived - (declared.balanceOpen + figures.cashReceived)) * 100,
    ) / 100;

    return {
      closeout,
      cashTotal: figures.cashReceived,
      pixTotal: figures.pixReceived,
      cardTotal: figures.cardReceived,
      fiadoTotal: figures.fiadoPaid,
      cashDiscrepancy,
    };
  }
}
