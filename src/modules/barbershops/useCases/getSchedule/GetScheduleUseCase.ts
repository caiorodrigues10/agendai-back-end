import { inject, injectable } from "tsyringe";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";

@injectable()
export class GetScheduleUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}
  async execute(barbershopId: string): Promise<Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>> {
    return this.barbershopRepository.getSchedule(barbershopId);
  }
}
