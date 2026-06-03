import { inject, injectable } from "tsyringe";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";

@injectable()
export class UpdateScheduleUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}
  async execute(
    barbershopId: string,
    schedule: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>
  ): Promise<Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>> {
    await this.barbershopRepository.updateSchedule(barbershopId, schedule);
    const updated = await this.barbershopRepository.getSchedule(barbershopId);
    return updated;
  }
}
