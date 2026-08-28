import { prisma } from "@/libs/prismaClient";
import { IUserRepository } from "../../repositories/IUserRepository";
import { ICreateUserDTO } from "../../dtos/ICreateUserDTO";
import { IUserResponseDTO } from "../../dtos/IUserResponseDTO";

const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  barbershopId: true,
  cpf: true,
  createdAt: true,
  active: true,
  deletedAt: true,
  termsVersion: true,
  termsAcceptedAt: true,
  marketingOptIn: true,
  marketingOptInAt: true,
  lgpdConsentAt: true,
  avatarUrl: true,
} as const;

export class UserRepository implements IUserRepository {
  async create(data: ICreateUserDTO): Promise<IUserResponseDTO> {
    return prisma.user.create({ data, select: publicSelect });
  }

  async findById(id: string): Promise<IUserResponseDTO | null> {
    return prisma.user.findUnique({ where: { id }, select: publicSelect });
  }

  async findByEmail(email: string): Promise<IUserResponseDTO | null> {
    const normalized = email.trim().toLowerCase();
    return prisma.user.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
      select: { ...publicSelect, password: true, googleSub: true, emailVerified: true }
    });
  }

  async findByCpf(cpf: string): Promise<IUserResponseDTO | null> {
    return prisma.user.findFirst({ where: { cpf }, select: publicSelect });
  }
}
