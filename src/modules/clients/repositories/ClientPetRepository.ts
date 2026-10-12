import { prisma } from "@/libs/prismaClient";
import {
  ICreateClientPetDTO,
  IUpdateClientPetDTO,
  IClientPetResponseDTO,
} from "../dto/IClientPetDTO";

export interface IClientPetRepository {
  create(data: ICreateClientPetDTO): Promise<IClientPetResponseDTO>;
  findById(id: string, barbershopId: string): Promise<IClientPetResponseDTO | null>;
  listByClient(barbershopId: string, clientId: string): Promise<IClientPetResponseDTO[]>;
  update(id: string, barbershopId: string, data: IUpdateClientPetDTO): Promise<IClientPetResponseDTO>;
  delete(id: string, barbershopId: string): Promise<void>;
}

export class ClientPetRepository implements IClientPetRepository {
  async create(data: ICreateClientPetDTO): Promise<IClientPetResponseDTO> {
    return prisma.clientPet.create({
      data: {
        barbershopId: data.barbershopId,
        clientId: data.clientId,
        name: data.name,
        species: data.species ?? "OTHER",
        breed: data.breed ?? null,
        size: data.size ?? null,
        coat: data.coat ?? null,
        notes: data.notes ?? null,
      },
    });
  }

  async findById(id: string, barbershopId: string): Promise<IClientPetResponseDTO | null> {
    return prisma.clientPet.findFirst({ where: { id, barbershopId } });
  }

  async listByClient(barbershopId: string, clientId: string): Promise<IClientPetResponseDTO[]> {
    return prisma.clientPet.findMany({
      where: { barbershopId, clientId },
      orderBy: { createdAt: "desc" },
    });
  }

  async update(id: string, barbershopId: string, data: IUpdateClientPetDTO): Promise<IClientPetResponseDTO> {
    return prisma.clientPet.update({
      where: { id, barbershopId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.species !== undefined && { species: data.species }),
        ...(data.breed !== undefined && { breed: data.breed }),
        ...(data.size !== undefined && { size: data.size }),
        ...(data.coat !== undefined && { coat: data.coat }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.active !== undefined && { active: data.active }),
      },
    });
  }

  async delete(id: string, barbershopId: string): Promise<void> {
    await prisma.clientPet.delete({ where: { id, barbershopId } });
  }
}
