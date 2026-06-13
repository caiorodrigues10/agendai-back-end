import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IExpenseRepository } from "../repositories/IExpenseRepository";
import {
  ICreateExpenseDTO,
  IUpdateExpenseDTO,
  IExpenseResponseDTO,
  IExpenseListQuery,
  IExpenseSummary,
} from "../dtos/IExpenseDTO";

@injectable()
export class CreateExpenseUseCase {
  constructor(
    @inject("ExpenseRepository")
    private expenseRepository: IExpenseRepository
  ) { }

  async execute(
    data: ICreateExpenseDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IExpenseResponseDTO> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }
    return this.expenseRepository.create(data);
  }
}

@injectable()
export class ListExpensesUseCase {
  constructor(
    @inject("ExpenseRepository")
    private expenseRepository: IExpenseRepository
  ) { }

  async execute(
    query: IExpenseListQuery & { barbershopId: string },
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<{ data: IExpenseResponseDTO[]; total: number }> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      query.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }
    return this.expenseRepository.list(query);
  }
}

@injectable()
export class GetExpenseUseCase {
  constructor(
    @inject("ExpenseRepository")
    private expenseRepository: IExpenseRepository
  ) { }

  async execute(
    id: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IExpenseResponseDTO> {
    const expense = await this.expenseRepository.findById(id);
    if (!expense) throw new AppError("Despesa não encontrada", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      expense.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }
    return expense;
  }
}

@injectable()
export class UpdateExpenseUseCase {
  constructor(
    @inject("ExpenseRepository")
    private expenseRepository: IExpenseRepository
  ) { }

  async execute(
    id: string,
    data: IUpdateExpenseDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IExpenseResponseDTO> {
    const expense = await this.expenseRepository.findById(id);
    if (!expense) throw new AppError("Despesa não encontrada", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      expense.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }
    return this.expenseRepository.update(id, data);
  }
}

@injectable()
export class DeleteExpenseUseCase {
  constructor(
    @inject("ExpenseRepository")
    private expenseRepository: IExpenseRepository
  ) { }

  async execute(
    id: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<void> {
    const expense = await this.expenseRepository.findById(id);
    if (!expense) throw new AppError("Despesa não encontrada", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      expense.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }
    await this.expenseRepository.delete(id);
  }
}

@injectable()
export class GetExpenseSummaryUseCase {
  constructor(
    @inject("ExpenseRepository")
    private expenseRepository: IExpenseRepository
  ) { }

  async execute(
    barbershopId: string,
    requestingUser: { role: string; barbershopId?: string },
    from?: Date,
    to?: Date
  ): Promise<IExpenseSummary> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a esta barbearia", 403);
    }
    return this.expenseRepository.getSummary(barbershopId, from, to);
  }
}