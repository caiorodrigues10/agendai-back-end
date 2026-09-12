import { prisma } from "@/libs/prismaClient";
import {
  ICreateProcedureRecordDTO,
  IUpdateProcedureRecordDTO,
  IProcedureRecordResponseDTO,
} from "../dto/IProcedureRecordDTO";

export interface IProcedureRecordRepository {
  create(data: ICreateProcedureRecordDTO): Promise<IProcedureRecordResponseDTO>;
  findById(id: string, barbershopId: string): Promise<IProcedureRecordResponseDTO | null>;
  listByClient(barbershopId: string, clientId: string, limit?: number): Promise<IProcedureRecordResponseDTO[]>;
  getLatestByClient(barbershopId: string, clientId: string): Promise<IProcedureRecordResponseDTO | null>;
  update(id: string, barbershopId: string, data: IUpdateProcedureRecordDTO): Promise<IProcedureRecordResponseDTO>;
  delete(id: string, barbershopId: string): Promise<void>;
  reassignClient(barbershopId: string, sourceClientIds: string[], targetClientId: string): Promise<number>;
}

export class ProcedureRecordRepository implements IProcedureRecordRepository {
  async create(data: ICreateProcedureRecordDTO): Promise<IProcedureRecordResponseDTO> {
    return prisma.clientProcedureRecord.create({
      data: {
        barbershopId: data.barbershopId,
        clientId: data.clientId,
        professionalName: data.professionalName,
        title: data.title,
        formula: data.formula ?? null,
        details: data.details ?? null,
        serviceName: data.serviceName ?? null,
        queueItemId: data.queueItemId ?? null,
        appointmentId: data.appointmentId ?? null,
        occurredAt: data.occurredAt ?? new Date(),
      },
    });
  }

  async findById(id: string, barbershopId: string): Promise<IProcedureRecordResponseDTO | null> {
    return prisma.clientProcedureRecord.findFirst({
      where: { id, barbershopId },
    });
  }

  async listByClient(barbershopId: string, clientId: string, limit = 50): Promise<IProcedureRecordResponseDTO[]> {
    return prisma.clientProcedureRecord.findMany({
      where: { barbershopId, clientId },
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
  }

  async getLatestByClient(barbershopId: string, clientId: string): Promise<IProcedureRecordResponseDTO | null> {
    return prisma.clientProcedureRecord.findFirst({
      where: { barbershopId, clientId },
      orderBy: { occurredAt: "desc" },
    });
  }

  async update(id: string, barbershopId: string, data: IUpdateProcedureRecordDTO): Promise<IProcedureRecordResponseDTO> {
    return prisma.clientProcedureRecord.update({
      where: { id, barbershopId },
      data: {
        ...(data.professionalName !== undefined && { professionalName: data.professionalName }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.formula !== undefined && { formula: data.formula }),
        ...(data.details !== undefined && { details: data.details }),
        ...(data.serviceName !== undefined && { serviceName: data.serviceName }),
      },
    });
  }

  async delete(id: string, barbershopId: string): Promise<void> {
    await prisma.clientProcedureRecord.delete({
      where: { id, barbershopId },
    });
  }

  async reassignClient(barbershopId: string, sourceClientIds: string[], targetClientId: string): Promise<number> {
    const result = await prisma.clientProcedureRecord.updateMany({
      where: { barbershopId, clientId: { in: sourceClientIds } },
      data: { clientId: targetClientId },
    });
    return result.count;
  }
}
