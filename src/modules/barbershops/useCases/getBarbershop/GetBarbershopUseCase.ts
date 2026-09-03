import { inject, injectable } from "tsyringe";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";
import { AppError } from "@/shared/errors/AppError";
import { getShopOpenState, listUpcomingExceptions } from "../../utils/getShopOpenState";
import { ymdInTimeZone } from "../../utils/shopOpenState";

@injectable()
export class GetBarbershopUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}
  async execute(id: string): Promise<IBarbershopResponseDTO> {
    const entity = await this.barbershopRepository.findById(id);
    if (!entity) throw new AppError("Salão não encontrado", 404);
    const openState = await getShopOpenState(id);
    const today = ymdInTimeZone(new Date(), "America/Sao_Paulo");
    const scheduleExceptions = await listUpcomingExceptions(id, today);
    return { ...entity, openState, scheduleExceptions };
  }
}
