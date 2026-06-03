import { inject, injectable } from "tsyringe";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { ICreateBarbershopDTO } from "../../dtos/ICreateBarbershopDTO";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";

@injectable()
export class CreateBarbershopUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}
  async execute(data: ICreateBarbershopDTO): Promise<IBarbershopResponseDTO> {
    return this.barbershopRepository.create(data);
  }
}
