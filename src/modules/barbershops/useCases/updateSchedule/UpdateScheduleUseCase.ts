import { inject, injectable } from "tsyringe";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { assertShopAccess, type RequestingUser } from "../../utils/assertShopAccess";

@injectable()
export class UpdateScheduleUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}
  async execute(
    barbershopId: string,
    schedule: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>,
    requestingUser: RequestingUser | undefined,
  ): Promise<Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>> {
    assertShopAccess(requestingUser, barbershopId);
    await this.barbershopRepository.updateSchedule(barbershopId, schedule);
    const updated = await this.barbershopRepository.getSchedule(barbershopId);
    return updated;
  }
}
