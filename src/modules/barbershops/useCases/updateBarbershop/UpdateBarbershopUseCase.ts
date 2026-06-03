import { inject, injectable } from "tsyringe";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { IUpdateBarbershopDTO } from "../../dtos/IUpdateBarbershopDTO";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";

@injectable()
export class UpdateBarbershopUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}
  async execute(id: string, data: IUpdateBarbershopDTO): Promise<IBarbershopResponseDTO> {
    return this.barbershopRepository.update(id, data);
  }
}
