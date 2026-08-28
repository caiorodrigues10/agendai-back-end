import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";

export type PublicStaffMember = { id: string; name: string };

@injectable()
export class ListPublicStaffUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}

  async execute(barbershopId: string): Promise<PublicStaffMember[]> {
    const shop = await this.barbershopRepository.findById(barbershopId);
    if (!shop) throw new AppError("Salão não encontrado", 404);

    return prisma.user.findMany({
      where: {
        barbershopId,
        active: true,
        role: { in: ["OWNER", "EMPLOYEE"] },
      },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
  }
}
