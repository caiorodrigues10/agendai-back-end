import { prisma } from "@/libs/prismaClient";
import {
  ICreateClientVehicleDTO,
  IUpdateClientVehicleDTO,
  IClientVehicleResponseDTO,
} from "../dto/IClientVehicleDTO";

export interface IClientVehicleRepository {
  create(data: ICreateClientVehicleDTO): Promise<IClientVehicleResponseDTO>;
  findById(id: string, barbershopId: string): Promise<IClientVehicleResponseDTO | null>;
  findByPlate(
    barbershopId: string,
    clientId: string,
    plate: string
  ): Promise<IClientVehicleResponseDTO | null>;
  listByClient(barbershopId: string, clientId: string): Promise<IClientVehicleResponseDTO[]>;
  update(
    id: string,
    barbershopId: string,
    data: IUpdateClientVehicleDTO
  ): Promise<IClientVehicleResponseDTO>;
  delete(id: string, barbershopId: string): Promise<void>;
}

export class ClientVehicleRepository implements IClientVehicleRepository {
  async create(data: ICreateClientVehicleDTO): Promise<IClientVehicleResponseDTO> {
    return prisma.clientVehicle.create({
      data: {
        barbershopId: data.barbershopId,
        clientId: data.clientId,
        plate: data.plate,
        vehicleModel: data.vehicleModel,
        color: data.color ?? null,
        notes: data.notes ?? null,
      },
    });
  }

  async findById(id: string, barbershopId: string): Promise<IClientVehicleResponseDTO | null> {
    return prisma.clientVehicle.findFirst({ where: { id, barbershopId } });
  }

  async findByPlate(
    barbershopId: string,
    clientId: string,
    plate: string
  ): Promise<IClientVehicleResponseDTO | null> {
    return prisma.clientVehicle.findFirst({ where: { barbershopId, clientId, plate } });
  }

  async listByClient(barbershopId: string, clientId: string): Promise<IClientVehicleResponseDTO[]> {
    return prisma.clientVehicle.findMany({
      where: { barbershopId, clientId },
      orderBy: { createdAt: "desc" },
    });
  }

  async update(
    id: string,
    barbershopId: string,
    data: IUpdateClientVehicleDTO
  ): Promise<IClientVehicleResponseDTO> {
    return prisma.clientVehicle.update({
      where: { id, barbershopId },
      data: {
        ...(data.plate !== undefined && { plate: data.plate }),
        ...(data.vehicleModel !== undefined && { vehicleModel: data.vehicleModel }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
  }

  async delete(id: string, barbershopId: string): Promise<void> {
    await prisma.clientVehicle.delete({ where: { id, barbershopId } });
  }
}
