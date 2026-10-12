import { prisma } from "@/libs/prismaClient";
import { ICreateBarbershopDTO } from "../../dtos/ICreateBarbershopDTO";
import { IUpdateBarbershopDTO } from "../../dtos/IUpdateBarbershopDTO";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";

const shopSelect = {
  id: true,
  name: true,
  whatsapp: true,
  logoUrl: true,
  googleReviewUrl: true,
  cnpj: true,
  address: true,
  city: true,
  latitude: true,
  longitude: true,
  operationMode: true,
  openingMode: true,
  businessSegment: true,
  manualStatus: true,
  createdAt: true,
  active: true,
  evolutionInstanceName: true,
} as const;

// Select das rotas PÚBLICAS (GET /barbershops e GET /barbershops/:id), que não
// exigem autenticação. Sempre sem `evolutionInstanceName`: é o nome da instância
// Evolution/WhatsApp, identificador interno usado para parear e enviar mensagens
// (ver WhatsAppConnectionUseCase e enqueueWhatsApp). Vazá-lo permitia que qualquer
// visitante listasse a instância de todos os salões. O frontend não consome o
// campo; os fluxos autenticados continuam em `shopSelect` via findById.
const { evolutionInstanceName: _evolutionInstanceName, ...publicShopSelect } = shopSelect;

export class BarbershopRepository implements IBarbershopRepository {
  async create(data: ICreateBarbershopDTO): Promise<IBarbershopResponseDTO> {
    return prisma.barbershop.create({
      data,
      select: shopSelect
    });
  }
  async findById(id: string): Promise<IBarbershopResponseDTO | null> {
    return prisma.barbershop.findUnique({
      where: { id },
      select: shopSelect
    });
  }
  async list(): Promise<IBarbershopResponseDTO[]> {
    return prisma.barbershop.findMany({
      orderBy: { name: "asc" },
      select: publicShopSelect
    });
  }
  async findByIdPublic(id: string): Promise<IBarbershopResponseDTO | null> {
    return prisma.barbershop.findUnique({
      where: { id },
      select: publicShopSelect
    });
  }
  async update(id: string, data: IUpdateBarbershopDTO): Promise<IBarbershopResponseDTO> {
    return prisma.barbershop.update({
      where: { id },
      data,
      select: shopSelect
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
