import { prisma } from "@/libs/prismaClient";
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
import { mapFiadoToDTO, mapPaymentToDTO } from "./fiadoMapper";

export class FiadoRepository implements IFiadoRepository {
  async create(data: ICreateFiadoDTO): Promise<IFiadoResponseDTO> {
    const record = await prisma.fiado.create({
      data: {
        barbershopId: data.barbershopId,
        customerName: data.customerName,
        whatsapp: data.whatsapp,
        description: data.description,
        originalAmount: data.amount,
        paidAmount: 0,
        status: "PENDING",
        dueDate: data.dueDate ?? null,
        notes: data.notes ?? null,
        createdById: data.createdById,
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
      where.status = { in: ["PENDING", "PARTIAL"] };
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
    const record = await prisma.fiado.update({
      where: { id },
      data: {
        ...(data.description !== undefined && { description: data.description }),
        ...(data.amount !== undefined && { originalAmount: data.amount }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.status !== undefined && { status: data.status }),
      },
      include: { payments: { orderBy: { createdAt: "asc" } } },
    });
    return mapFiadoToDTO(record);
  }

  async delete(id: string): Promise<void> {
    await prisma.fiado.delete({ where: { id } });
  }

  async addPayment(data: ICreateFiadoPaymentDTO): Promise<IFiadoPaymentResponseDTO> {
    const fiado = await prisma.fiado.findUniqueOrThrow({
      where: { id: data.fiadoId },
      select: { originalAmount: true, paidAmount: true, status: true },
    });

    if (fiado.status === "PAID" || fiado.status === "FORGIVEN") {
      throw new Error("Este fiado já está encerrado.");
    }

    const newPaidAmount = fiado.paidAmount + data.amount;
    const newStatus: FiadoStatus =
      newPaidAmount >= fiado.originalAmount ? "PAID" : "PARTIAL";

    const [payment] = await prisma.$transaction([
      prisma.fiadoPayment.create({
        data: {
          fiadoId: data.fiadoId,
          amount: data.amount,
          notes: data.notes ?? null,
          registeredById: data.registeredById,
        },
      }),
      prisma.fiado.update({
        where: { id: data.fiadoId },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus,
        },
      }),
    ]);

    return mapPaymentToDTO(payment);
  }

  async getSummary(barbershopId: string): Promise<IFiadoSummary> {
    const now = new Date();

    const [fiados, overdueCount]: [
      Array<{ originalAmount: number; paidAmount: number; dueDate: Date | null }>,
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
    const totalPending = totalOriginal - totalPaid;

    const overdueAmount = fiados
      .filter((f) => f.dueDate && f.dueDate < now)
      .reduce((s: number, f) => s + (f.originalAmount - f.paidAmount), 0);

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