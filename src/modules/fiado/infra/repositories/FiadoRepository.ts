import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IFiadoRepository } from "../../repositories/IFiadoRepository";
import {
  ICreateFiadoDTO,
  ICreateFiadoPaymentDTO,
  IUpdateFiadoDTO,
  IFiadoResponseDTO,
  IFiadoListQuery,
  IFiadoSummary,
  IFiadoPaymentResponseDTO,
  FiadoStatus,
} from "../../dtos/IFiadoDTO"
import { mapFiadoToDTO } from "./fiadoMapper";

export class FiadoRepository implements IFiadoRepository {
  async create(data: ICreateFiadoDTO): Promise<IFiadoResponseDTO> {
    const record = await prisma.fiado.create({
      data: {
        barbershopId: data.barbershopId,
        customerName: data.customerName,
        whatsapp: data.whatsapp,
        clientId: data.clientId ?? null,
        description: data.description,
        originalAmount: data.amount,
        paidAmount: 0,
        status: "PENDING",
        dueDate: data.dueDate ?? null,
        notes: data.notes ?? null,
        createdById: data.createdById,
        origin: data.origin ?? "MANUAL",
        retailSaleId: data.retailSaleId ?? null,
      },
      include: { payments: true },
    });
    return mapFiadoToDTO(record);
  }

  async findById(id: string): Promise<IFiadoResponseDTO | null> {
    const record = await prisma.fiado.findUnique({
      where: { id },
      include: { payments: { orderBy: { createdAt: "asc" } } },
    });
    return record ? mapFiadoToDTO(record) : null;
  }

  async list(
    query: IFiadoListQuery & { barbershopId: string }
  ): Promise<{ data: IFiadoResponseDTO[]; total: number }> {
    const skip = (query.page - 1) * query.limit;

    const where: any = { barbershopId: query.barbershopId };

    if (query.status) where.status = query.status;

    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from && { gte: query.from }),
        ...(query.to && { lte: query.to }),
      };
    }

    if (query.overdue === true) {
      where.dueDate = { lt: new Date() };
      if (!query.status) where.status = { in: ["PENDING", "PARTIAL"] };
    }

    if (query.search) {
      where.OR = [
        { customerName: { contains: query.search, mode: "insensitive" } },
        { whatsapp: { contains: query.search } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.fiado.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        include: { payments: { orderBy: { createdAt: "asc" } } },
      }),
      prisma.fiado.count({ where }),
    ]);

    return { data: records.map(mapFiadoToDTO), total };
  }

  async update(id: string, data: IUpdateFiadoDTO): Promise<IFiadoResponseDTO> {
    if (data.amount !== undefined && data.amount <= 0) {
      throw new AppError("O valor deve ser maior que zero", 400);
    }

    const existing = data.amount !== undefined ? await prisma.fiado.findUnique({ where: { id }, select: { paidAmount: true, creditAdjustedAmount: true } }) : null;
    if (existing && data.amount !== undefined) {
      const totalPaid = existing.paidAmount + (existing.creditAdjustedAmount ?? 0);
      if (data.amount < totalPaid) {
        throw new AppError("O valor total não pode ser menor que já foi pago/creditado", 400);
      }
    }

    const record = await prisma.fiado.update({
      where: { id },
      data: {
        ...(data.description !== undefined && { description: data.description }),
        ...(data.amount !== undefined && { originalAmount: data.amount }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.updatedById !== undefined && { updatedById: data.updatedById }),
      },
      include: { payments: { orderBy: { createdAt: "asc" } } },
    });
    return mapFiadoToDTO(record);
  }

  async delete(id: string): Promise<void> {
    const payments = await prisma.fiadoPayment.count({ where: { fiadoId: id } });
    if (payments > 0) {
      throw new AppError("Não é possível excluir um fiado que já possui pagamentos registrados", 400);
    }
    await prisma.fiado.delete({ where: { id } });
  }

  async addPayment(data: ICreateFiadoPaymentDTO): Promise<IFiadoPaymentResponseDTO> {
    return prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT set_config('app.current_barbershop_id', ${data.barbershopId}, TRUE)`;

      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          originalAmount: unknown;
          paidAmount: unknown;
          creditAdjustedAmount: unknown;
          status: string;
        }>
      >`
        SELECT id, "originalAmount", "paidAmount", "creditAdjustedAmount", status
        FROM fiados
        WHERE id = ${data.fiadoId}::uuid
        FOR UPDATE
      `;
      const fiado = rows[0];
      if (!fiado) throw new AppError("Fiado não encontrado", 404);

      const status = fiado.status as FiadoStatus;
      if (status === "PAID" || status === "FORGIVEN") {
        throw new AppError("Este fiado já está encerrado.", 400);
      }

      const originalAmount = Number(fiado.originalAmount);
      const paidAmount = Number(fiado.paidAmount);
      const creditAdjustedAmount = Number(fiado.creditAdjustedAmount ?? 0);

      const remaining = originalAmount - paidAmount - creditAdjustedAmount;
      if (data.amount - remaining > 0.01) {
        throw new AppError("Valor do pagamento maior que o saldo devedor", 400);
      }

      const newPaidAmount = paidAmount + data.amount;
      const newStatus: FiadoStatus =
        newPaidAmount + creditAdjustedAmount >= originalAmount ? "PAID" : "PARTIAL";

      const paymentId = crypto.randomUUID();
      const createdAt = new Date();

      await tx.$executeRaw`
        INSERT INTO fiado_payments (id, "fiadoId", amount, notes, "registeredById", "createdAt")
        VALUES (${paymentId}::uuid, ${data.fiadoId}::uuid, ${data.amount}, ${data.notes ?? null}, ${data.registeredById}::uuid, ${createdAt})
      `;
      await tx.$executeRaw`
        UPDATE fiados
        SET "paidAmount" = ${newPaidAmount}, status = ${newStatus}::"FiadoStatus", "updatedAt" = ${createdAt}
        WHERE id = ${data.fiadoId}::uuid
      `;

      return {
        id: paymentId,
        fiadoId: data.fiadoId,
        amount: data.amount,
        notes: data.notes ?? null,
        registeredById: data.registeredById,
        createdAt,
      };
    });
  }

  async getSummary(barbershopId: string): Promise<IFiadoSummary> {
    const now = new Date();

    const [fiados, overdueCount]: [
      Array<{ originalAmount: number; paidAmount: number; creditAdjustedAmount: number; dueDate: Date | null }>,
      number
    ] = await Promise.all([
      prisma.fiado.findMany({
        where: {
          barbershopId,
          status: { in: ["PENDING", "PARTIAL"] },
        },
        select: {
          originalAmount: true,
          paidAmount: true,
          creditAdjustedAmount: true,
          dueDate: true,
        },
      }),
      prisma.fiado.count({
        where: {
          barbershopId,
          status: { in: ["PENDING", "PARTIAL"] },
          dueDate: { lt: now },
        },
      }),
    ]);

    const totalDebtors = fiados.length;
    const totalOriginal = fiados.reduce((s: number, f) => s + f.originalAmount, 0);
    const totalPaid = fiados.reduce((s: number, f) => s + f.paidAmount, 0);
    const totalPending = fiados.reduce((s: number, f) => s + Math.max(0, f.originalAmount - f.paidAmount - (f.creditAdjustedAmount ?? 0)), 0);

    const overdueAmount = fiados
      .filter((f) => f.dueDate && f.dueDate < now)
      .reduce((s: number, f) => s + Math.max(0, f.originalAmount - f.paidAmount - (f.creditAdjustedAmount ?? 0)), 0);

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
