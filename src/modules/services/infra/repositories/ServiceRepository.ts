import { prisma } from "@/libs/prismaClient";
import { ICreateServiceDTO } from "../../dtos/ICreateServiceDTO";
import { IUpdateServiceDTO } from "../../dtos/IUpdateServiceDTO";
import { IServiceResponseDTO } from "../../dtos/IServiceResponseDTO";
import { IServiceRepository } from "../../repositories/IServiceRepository";

export class ServiceRepository implements IServiceRepository {
  async create(data: ICreateServiceDTO): Promise<IServiceResponseDTO> {
    return prisma.service.create({
      data,
      select: {
        id: true,
        barbershopId: true,
        name: true,
        price: true,
        avgTimeMinutes: true,
        icon: true,
        createdAt: true,
        active: true
      }
    });
  }
  async findById(id: string, barbershopId?: string): Promise<IServiceResponseDTO | null> {
    return prisma.service.findFirst({
      where: { id, ...(barbershopId ? { barbershopId } : {}) },
      select: {
        id: true,
        barbershopId: true,
        name: true,
        price: true,
        avgTimeMinutes: true,
        icon: true,
        createdAt: true,
        active: true
      }
    });
  }
  async list(barbershopId?: string): Promise<IServiceResponseDTO[]> {
    if (!barbershopId) return [];
    return prisma.service.findMany({
      where: { barbershopId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        barbershopId: true,
        name: true,
        price: true,
        avgTimeMinutes: true,
        icon: true,
        createdAt: true,
        active: true
      }
    });
  }
  async update(id: string, data: IUpdateServiceDTO): Promise<IServiceResponseDTO> {
    return prisma.service.update({
      where: { id },
      data,
      select: {
        id: true,
        barbershopId: true,
        name: true,
        price: true,
        avgTimeMinutes: true,
        icon: true,
        createdAt: true,
        active: true
      }
    });
  }
  async deactivate(id: string): Promise<void> {
    await prisma.service.update({
      where: { id },
      data: { active: false }
    });
  }
}
