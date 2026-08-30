import { prisma } from "@/libs/prismaClient";
import { ICreateBarbershopDTO } from "../../dtos/ICreateBarbershopDTO";
import { IUpdateBarbershopDTO } from "../../dtos/IUpdateBarbershopDTO";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";

export class BarbershopRepository implements IBarbershopRepository {
  async create(data: ICreateBarbershopDTO): Promise<IBarbershopResponseDTO> {
    return prisma.barbershop.create({
      data,
      select: {
        id: true,
        name: true,
        whatsapp: true,
        logoUrl: true,
        cnpj: true,
        address: true,
        city: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        active: true,
        evolutionInstanceName: true
      }
    });
  }
  async findById(id: string): Promise<IBarbershopResponseDTO | null> {
    return prisma.barbershop.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        whatsapp: true,
        logoUrl: true,
        cnpj: true,
        address: true,
        city: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        active: true,
        evolutionInstanceName: true
      }
    });
  }
  async list(): Promise<IBarbershopResponseDTO[]> {
    return prisma.barbershop.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        whatsapp: true,
        logoUrl: true,
        cnpj: true,
        address: true,
        city: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        active: true,
        evolutionInstanceName: true
      }
    });
  }
  async update(id: string, data: IUpdateBarbershopDTO): Promise<IBarbershopResponseDTO> {
    return prisma.barbershop.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        whatsapp: true,
        logoUrl: true,
        cnpj: true,
        address: true,
        city: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        active: true,
        evolutionInstanceName: true
      }
    });
  }
  async deactivate(id: string): Promise<void> {
    await prisma.barbershop.update({
      where: { id },
      data: { active: false }
    });
  }
  async getSchedule(barbershopId: string): Promise<Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>> {
    const schedules = await prisma.schedule.findMany({
      where: { barbershopId },
      orderBy: { dayOfWeek: "asc" },
      select: { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true }
    });
    return schedules;
  }
  async updateSchedule(
    barbershopId: string,
    schedule: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>
  ): Promise<void> {
    await prisma.$transaction([
      prisma.schedule.deleteMany({ where: { barbershopId } }),
      prisma.schedule.createMany({
        data: schedule.map((s) => ({ barbershopId, ...s }))
      })
    ]);
  }
}
