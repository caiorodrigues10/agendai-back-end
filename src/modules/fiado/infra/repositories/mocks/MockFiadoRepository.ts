import { IFiadoRepository } from "@/modules/fiado/repositories/IFiadoRepository";
import { civilDayBounds } from "@/shared/utils/dateUtils";
import {
  ICreateFiadoDTO,
  ICreateFiadoPaymentDTO,
  IUpdateFiadoDTO,
  IFiadoResponseDTO,
  IFiadoListQuery,
  IFiadoSummary,
  IFiadoPaymentResponseDTO,
  FiadoStatus,
} from "@/modules/fiado/dtos/IFiadoDTO";

export class MockFiadoRepository implements IFiadoRepository {
  public fiados: IFiadoResponseDTO[] = [];
  private seq = 1;
  private paymentSeq = 1;

  async create(data: ICreateFiadoDTO): Promise<IFiadoResponseDTO> {
    const now = new Date();
    const entity: IFiadoResponseDTO = {
      id: `fiado-${this.seq++}`,
      barbershopId: data.barbershopId,
      customerName: data.customerName,
      whatsapp: data.whatsapp,
      clientId: data.clientId ?? null,
      description: data.description,
      originalAmount: data.amount,
      paidAmount: 0,
      remainingAmount: data.amount,
      status: "PENDING",
      dueDate: data.dueDate ?? null,
      notes: data.notes ?? null,
      createdById: data.createdById,
      updatedById: null,
      createdAt: now,
      updatedAt: now,
      payments: [],
      isOverdue: false,
    };
    this.fiados.push(entity);
    return entity;
  }

  async findById(id: string): Promise<IFiadoResponseDTO | null> {
    return this.fiados.find((f) => f.id === id) ?? null;
  }

  async list(
    query: IFiadoListQuery & { barbershopId: string }
  ): Promise<{ data: IFiadoResponseDTO[]; total: number }> {
    const now = new Date();
    let results = this.fiados.filter(
      (f) => f.barbershopId === query.barbershopId
    );

    if (query.status && query.status.length > 0) {
      results = results.filter((f) => query.status!.includes(f.status));
    }

    if (query.clientId) {
      results = results.filter((f) => f.clientId === query.clientId);
    }

    if (query.from || query.to) {
      const gte = query.from ? civilDayBounds(query.from, query.timeZone).gte : null;
      const lt = query.to ? civilDayBounds(query.to, query.timeZone).lt : null;
      results = results.filter(
        (f) =>
          (!gte || f.createdAt >= gte) && (!lt || f.createdAt < lt)
      );
    }

    if (query.dueFrom || query.dueTo) {
      const gte = query.dueFrom ? civilDayBounds(query.dueFrom, query.timeZone).gte : null;
      const lt = query.dueTo ? civilDayBounds(query.dueTo, query.timeZone).lt : null;
      results = results.filter(
        (f) =>
          f.dueDate !== null &&
          (!gte || f.dueDate >= gte) &&
          (!lt || f.dueDate < lt)
      );
    }

    if (query.overdue === true) {
      results = results.filter(
        (f) =>
          f.dueDate &&
          f.dueDate < now &&
          (f.status === "PENDING" || f.status === "PARTIAL")
      );
    }

    if (query.search) {
      const term = query.search.toLowerCase();
      results = results.filter(
        (f) =>
          f.customerName.toLowerCase().includes(term) ||
          f.whatsapp.includes(term)
      );
    }

    results = this.sortResults(results, query.sort?.field, query.sort?.dir ?? "desc");

    const total = results.length;
    const start = (query.page - 1) * query.limit;
    const data = results.slice(start, start + query.limit);

    return { data, total };
  }

  /** Espelha o `orderBy` do repositório real (incluindo `nulls: "last"`). */
  private sortResults(
    results: IFiadoResponseDTO[],
    field: string | undefined,
    dir: "asc" | "desc",
  ): IFiadoResponseDTO[] {
    return [...results].sort((a, b) => {
      let cmp = 0;

      if (field === "dueDate") {
        if (a.dueDate === null && b.dueDate === null) cmp = 0;
        else if (a.dueDate === null) return 1;
        else if (b.dueDate === null) return -1;
        else cmp = a.dueDate.getTime() - b.dueDate.getTime();
      } else if (field === "amount") {
        cmp = a.originalAmount - b.originalAmount;
      } else {
        cmp = a.createdAt.getTime() - b.createdAt.getTime();
      }

      if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      return dir === "asc"
        ? a.id.localeCompare(b.id)
        : b.id.localeCompare(a.id);
    });
  }

  async update(id: string, data: IUpdateFiadoDTO): Promise<IFiadoResponseDTO> {
    const idx = this.fiados.findIndex((f) => f.id === id);
    if (idx < 0) throw new Error("Fiado não encontrado");

    const current = this.fiados[idx];
    const updated: IFiadoResponseDTO = {
      ...current,
      ...(data.description !== undefined && { description: data.description }),
      ...(data.amount !== undefined && {
        originalAmount: data.amount,
        remainingAmount: data.amount - current.paidAmount,
      }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.updatedById !== undefined && { updatedById: data.updatedById }),
      updatedAt: new Date(),
    };

    this.fiados[idx] = updated;
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.fiados = this.fiados.filter((f) => f.id !== id);
  }

  async addPayment(
    data: ICreateFiadoPaymentDTO
  ): Promise<IFiadoPaymentResponseDTO> {
    const idx = this.fiados.findIndex((f) => f.id === data.fiadoId);
    if (idx < 0) throw new Error("Fiado não encontrado");

    const fiado = this.fiados[idx];

    if (fiado.status === "PAID" || fiado.status === "FORGIVEN") {
      throw new Error("Este fiado já está encerrado.");
    }

    const newPaidAmount = fiado.paidAmount + data.amount;
    const newStatus: FiadoStatus =
      newPaidAmount >= fiado.originalAmount ? "PAID" : "PARTIAL";

    const payment: IFiadoPaymentResponseDTO = {
      id: `payment-${this.paymentSeq++}`,
      fiadoId: data.fiadoId,
      amount: data.amount,
      paymentMethod: data.paymentMethod ?? null,
      notes: data.notes ?? null,
      registeredById: data.registeredById,
      createdAt: new Date(),
    };

    this.fiados[idx] = {
      ...fiado,
      paidAmount: newPaidAmount,
      remainingAmount: Math.max(0, fiado.originalAmount - newPaidAmount),
      status: newStatus,
      payments: [...fiado.payments, payment],
      updatedAt: new Date(),
    };

    return payment;
  }

  async getSummary(barbershopId: string): Promise<IFiadoSummary> {
    const now = new Date();
    const ativos = this.fiados.filter(
      (f) =>
        f.barbershopId === barbershopId &&
        (f.status === "PENDING" || f.status === "PARTIAL")
    );

    const totalDebtors = ativos.length;
    const totalOriginal = ativos.reduce((s, f) => s + f.originalAmount, 0);
    const totalPaid = ativos.reduce((s, f) => s + f.paidAmount, 0);
    const totalPending = totalOriginal - totalPaid;

    const vencidos = ativos.filter((f) => f.dueDate && f.dueDate < now);
    const overdueCount = vencidos.length;
    const overdueAmount = vencidos.reduce(
      (s, f) => s + (f.originalAmount - f.paidAmount),
      0
    );

    return {
      totalDebtors,
      totalPending,
      totalOriginal,
      totalPaid,
      overdueCount,
      overdueAmount,
    };
  }
}
