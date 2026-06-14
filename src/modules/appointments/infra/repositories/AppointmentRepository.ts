import { Prisma } from "@prisma/client";
import { prisma } from "@/libs/prismaClient";
import { IAppointmentRepository } from "../../repositories/IAppointmentRepository";
import {
  ICreateAppointmentDTO,
  IUpdateAppointmentDTO,
  IAppointmentResponseDTO,
  IListAppointmentsQuery,
  AppointmentStatus,
} from "../../dtos/IAppointmentDTO";

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: {
    service: { select: { name: true; price: true } };
    staff: { select: { name: true } };
  };
}>;

function mapToDTO(record: AppointmentWithRelations): IAppointmentResponseDTO {
  return {
    id: record.id,
    barbershopId: record.barbershopId,
    serviceId: record.serviceId,
    serviceName: record.service?.name ?? null,
    servicePrice: record.service?.price ?? null,
    staffId: record.staffId ?? null,
    staffName: record.staff?.name ?? null,
    customerName: record.customerName,
    whatsapp: record.whatsapp,
    date: record.date,
    time: record.time,
    status: record.status as AppointmentStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

const include = {
  service: { select: { name: true, price: true } },
  staff: { select: { name: true } },
} as const;

export class AppointmentRepository implements IAppointmentRepository {
  async create(data: ICreateAppointmentDTO): Promise<IAppointmentResponseDTO> {
    const record = await prisma.appointment.create({
      data: {
        barbershopId: data.barbershopId,
        serviceId: data.serviceId,
        staffId: data.staffId ?? null,
        customerName: data.customerName,
        whatsapp: data.whatsapp,
        date: new Date(data.date),
        time: data.time,
        status: "CONFIRMED",
      },
      include,
    });
    return mapToDTO(record);
  }

  async findById(id: string): Promise<IAppointmentResponseDTO | null> {
    const record = await prisma.appointment.findUnique({ where: { id }, include });
    return record ? mapToDTO(record) : null;
  }

  async list(
    barbershopId: string,
    query: IListAppointmentsQuery
  ): Promise<{ data: IAppointmentResponseDTO[]; total: number }> {
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.AppointmentWhereInput = { barbershopId };

    if (query.date) {
      const day = new Date(query.date);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      where.date = { gte: day, lt: next };
    }
    if (query.status) where.status = query.status;
    if (query.staffId) where.staffId = query.staffId;
    if (query.search) {
      where.OR = [
        { customerName: { contains: query.search, mode: "insensitive" } },
        { whatsapp: { contains: query.search } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ date: "asc" }, { time: "asc" }],
        include,
      }),
      prisma.appointment.count({ where }),
    ]);

    return { data: records.map(mapToDTO), total };
  }

  async update(
    id: string,
    data: IUpdateAppointmentDTO
  ): Promise<IAppointmentResponseDTO> {
    const record = await prisma.appointment.update({
      where: { id },
      data: {
        ...(data.staffId !== undefined && { staffId: data.staffId }),
        ...(data.customerName !== undefined && { customerName: data.customerName }),
        ...(data.whatsapp !== undefined && { whatsapp: data.whatsapp }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
        ...(data.time !== undefined && { time: data.time }),
        ...(data.status !== undefined && { status: data.status }),
      },
      include,
    });
    return mapToDTO(record);
  }

  async delete(id: string): Promise<void> {
    // Soft delete: apenas cancela
    await prisma.appointment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  }
}
