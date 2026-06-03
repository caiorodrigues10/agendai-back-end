import { prisma } from "@/libs/prismaClient";
import { IUserRepository } from "../../repositories/IUserRepository";
import { ICreateUserDTO } from "../../dtos/ICreateUserDTO";
import { IUserResponseDTO } from "../../dtos/IUserResponseDTO";

export class UserRepository implements IUserRepository {
  async create(data: ICreateUserDTO): Promise<IUserResponseDTO> {
    return prisma.user.create({
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        barbershopId: true,
        createdAt: true,
        active: true
      }
    });
  }

  async findById(id: string): Promise<IUserResponseDTO | null> {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        barbershopId: true,
        createdAt: true,
        active: true
      }
    });
  }

  async findByEmail(email: string): Promise<IUserResponseDTO | null> {
    return prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        barbershopId: true,
        password: true,
        createdAt: true,
        active: true
      }
    });
  }
}
