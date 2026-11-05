import { IExpenseRepository } from "@/modules/expenses/repositories/IExpenseRepository";
import { utcDayBounds } from "@/shared/utils/dateUtils";
import {
  ICreateExpenseDTO,
  IUpdateExpenseDTO,
  IExpenseResponseDTO,
  IExpenseListQuery,
  IExpenseSummary,
  ExpenseType,
} from "@/modules/expenses/dtos/IExpenseDTO";

/**
 * Mock em memória do repositório de despesas.
 *
 * A listagem espelha o `where` do repositório real (`expenseListWhere.ts`):
 * uma cláusula por filtro, `barbershopId` sempre do contexto, status de
 * pagamento derivado de `paidAt`/`dueDate` e ordenação com `nulls: "last"`
 * em `dueDate`.
 */
export class MockExpenseRepository implements IExpenseRepository {
  public expenses: IExpenseResponseDTO[] = [];
  private seq = 1;

  async create(data: ICreateExpenseDTO): Promise<IExpenseResponseDTO> {
    const now = new Date();
    const entity: IExpenseResponseDTO = {
      id: `expense-${this.seq++}`,
      barbershopId: data.barbershopId,
      categoryId: data.categoryId ?? null,
      categoryName: null,
      title: data.title,
      description: data.description ?? null,
      amount: data.amount,
      type: data.type ?? "VARIABLE",
      recurrence: data.recurrence ?? "ONCE",
      referenceDate: data.referenceDate,
      paidAt: data.paidAt ?? null,
      dueDate: data.dueDate ?? null,
      paymentMethod: data.paymentMethod ?? null,
      supplierName: data.supplierName ?? null,
      receiptUrl: data.receiptUrl ?? null,
      notes: data.notes ?? null,
      createdById: data.createdById,
      updatedById: null,
      createdAt: now,
      updatedAt: now,
    };
    this.expenses.push(entity);
    return entity;
  }

  async findById(id: string): Promise<IExpenseResponseDTO | null> {
    return this.expenses.find((e) => e.id === id) ?? null;
  }

  async list(
    query: IExpenseListQuery & { barbershopId: string }
  ): Promise<{ data: IExpenseResponseDTO[]; total: number }> {
    const now = new Date();
    let results = this.expenses.filter(
      (e) => e.barbershopId === query.barbershopId
    );

    if (query.categoryId) {
      results = results.filter((e) => e.categoryId === query.categoryId);
    }

    if (query.type) {
      results = results.filter((e) => e.type === query.type);
    }

    if (query.recurrence) {
      results = results.filter((e) => e.recurrence === query.recurrence);
    }

    if (query.paymentMethod) {
      const method = query.paymentMethod.toLowerCase();
      results = results.filter(
        (e) => (e.paymentMethod ?? "").toLowerCase() === method
      );
    }

    const payment = new Set<string>(query.payment ?? []);
    if (query.paid === true) payment.add("paid");
    if (query.paid === false) payment.add("pending");

    if (payment.has("paid")) {
      results = results.filter((e) => e.paidAt !== null);
    }
    if (payment.has("pending")) {
      results = results.filter((e) => e.paidAt === null);
    }
    if (payment.has("overdue")) {
      results = results.filter(
        (e) => e.paidAt === null && e.dueDate !== null && e.dueDate < now
      );
    }

    if (query.from || query.to) {
      const gte = query.from ? utcDayBounds(query.from).gte : null;
      const lt = query.to ? utcDayBounds(query.to).lt : null;
      results = results.filter(
        (e) =>
          (!gte || e.referenceDate >= gte) && (!lt || e.referenceDate < lt)
      );
    }

    if (query.search) {
      const term = query.search.toLowerCase();
      results = results.filter(
        (e) =>
          e.title.toLowerCase().includes(term) ||
          (e.supplierName ?? "").toLowerCase().includes(term) ||
          (e.notes ?? "").toLowerCase().includes(term)
      );
    }

    results = this.sortResults(
      results,
      query.sort?.field,
      query.sort?.dir ?? "desc"
    );

    const total = results.length;
    const start = (query.page - 1) * query.limit;
    const data = results.slice(start, start + query.limit);

    return { data, total };
  }

  /** Espelha o `orderBy` do repositório real (incluindo `nulls: "last"`). */
  private sortResults(
    results: IExpenseResponseDTO[],
    field: string | undefined,
    dir: "asc" | "desc"
  ): IExpenseResponseDTO[] {
    return [...results].sort((a, b) => {
      let cmp = 0;

      if (field === "amount") {
        cmp = a.amount - b.amount;
      } else if (field === "dueDate") {
        if (a.dueDate === null && b.dueDate === null) cmp = 0;
        else if (a.dueDate === null) return 1;
        else if (b.dueDate === null) return -1;
        else cmp = a.dueDate.getTime() - b.dueDate.getTime();
      } else if (field === "createdAt") {
        cmp = a.createdAt.getTime() - b.createdAt.getTime();
      } else {
        cmp = a.referenceDate.getTime() - b.referenceDate.getTime();
      }

      if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      return dir === "asc"
        ? a.id.localeCompare(b.id)
        : b.id.localeCompare(a.id);
    });
  }

  async update(
    id: string,
    data: IUpdateExpenseDTO
  ): Promise<IExpenseResponseDTO> {
    const idx = this.expenses.findIndex((e) => e.id === id);
    if (idx < 0) throw new Error("Despesa não encontrada");

    const current = this.expenses[idx];
    const updated: IExpenseResponseDTO = {
      ...current,
      ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.recurrence !== undefined && { recurrence: data.recurrence }),
      ...(data.referenceDate !== undefined && {
        referenceDate: data.referenceDate,
      }),
      ...(data.paidAt !== undefined && { paidAt: data.paidAt }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
      ...(data.paymentMethod !== undefined && {
        paymentMethod: data.paymentMethod,
      }),
      ...(data.supplierName !== undefined && {
        supplierName: data.supplierName,
      }),
      ...(data.receiptUrl !== undefined && { receiptUrl: data.receiptUrl }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.updatedById !== undefined && { updatedById: data.updatedById }),
      updatedAt: new Date(),
    };
    this.expenses[idx] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    const idx = this.expenses.findIndex((e) => e.id === id);
    if (idx < 0) throw new Error("Despesa não encontrada");
    this.expenses.splice(idx, 1);
  }

  async getSummary(
    barbershopId: string,
    from?: Date,
    to?: Date
  ): Promise<IExpenseSummary> {
    const scoped = this.expenses.filter(
      (e) =>
        e.barbershopId === barbershopId &&
        (!from || e.referenceDate >= from) &&
        (!to || e.referenceDate <= to)
    );

    const totalAmount = scoped.reduce((s, e) => s + e.amount, 0);
    const totalPaid = scoped
      .filter((e) => e.paidAt !== null)
      .reduce((s, e) => s + e.amount, 0);

    const byCategory = new Map<string | null, { total: number; count: number }>();
    const byType = new Map<ExpenseType, { total: number; count: number }>();
    const byMonth = new Map<string, { total: number; count: number }>();

    for (const e of scoped) {
      const category = byCategory.get(e.categoryId) ?? { total: 0, count: 0 };
      category.total += e.amount;
      category.count += 1;
      byCategory.set(e.categoryId, category);

      const type = byType.get(e.type) ?? { total: 0, count: 0 };
      type.total += e.amount;
      type.count += 1;
      byType.set(e.type, type);

      const month = e.referenceDate.toISOString().slice(0, 7);
      const monthEntry = byMonth.get(month) ?? { total: 0, count: 0 };
      monthEntry.total += e.amount;
      monthEntry.count += 1;
      byMonth.set(month, monthEntry);
    }

    return {
      totalAmount,
      totalPaid,
      totalPending: totalAmount - totalPaid,
      byCategory: [...byCategory.entries()].map(([categoryId, acc]) => ({
        categoryId,
        categoryName: null,
        total: acc.total,
        count: acc.count,
      })),
      byType: [...byType.entries()].map(([type, acc]) => ({
        type,
        total: acc.total,
        count: acc.count,
      })),
      byMonth: [...byMonth.entries()].map(([month, acc]) => ({
        month,
        total: acc.total,
        count: acc.count,
      })),
    };
  }
}
