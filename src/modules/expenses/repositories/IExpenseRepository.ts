import {
  ICreateExpenseDTO,
  IUpdateExpenseDTO,
  IExpenseResponseDTO,
  IExpenseListQuery,
  IExpenseSummary,
} from "../dtos/IExpenseDTO";

export interface IExpenseRepository {
  create(data: ICreateExpenseDTO): Promise<IExpenseResponseDTO>;
  findById(id: string): Promise<IExpenseResponseDTO | null>;
  list(query: IExpenseListQuery & { barbershopId: string }): Promise<{ data: IExpenseResponseDTO[]; total: number }>;
  update(id: string, data: IUpdateExpenseDTO): Promise<IExpenseResponseDTO>;
  delete(id: string): Promise<void>;
  getSummary(barbershopId: string, from?: Date, to?: Date): Promise<IExpenseSummary>;
}