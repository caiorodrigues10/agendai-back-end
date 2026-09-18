import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { invalidateSubscriptionCache } from "@/shared/infra/http/middlewares/subscriptionAccessCache";

@injectable()
export class DeleteBarbershopUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}
  async execute(id: string): Promise<void> {
    await prisma.$transaction(async (tx: any) => {
      await tx.refreshToken.deleteMany({
        where: { user: { barbershopId: id } },
      });
      await tx.subscription.updateMany({
        where: { barbershopId: id, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
        data: {
          status: "CANCELED",
          cancelDate: new Date(),
          cancelReason: "Salão desativado",
        },
      });
      await tx.barbershop.update({
        where: { id },
        data: {
          active: false,
          evolutionInstanceName: null,
          whatsapp: "",
        },
      });
    });
    await invalidateSubscriptionCache(id);
    await this.barbershopRepository.deactivate(id);
  }
}
