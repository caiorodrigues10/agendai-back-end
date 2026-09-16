import { inject, injectable } from "tsyringe";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";
import { AppError } from "@/shared/errors/AppError";
import { getShopOpenState } from "../../utils/getShopOpenState";

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
    return { ...entity, openState };
  }
}
