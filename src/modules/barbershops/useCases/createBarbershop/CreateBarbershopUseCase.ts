import { inject, injectable } from "tsyringe";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { ICreateBarbershopDTO } from "../../dtos/ICreateBarbershopDTO";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";
import { checkCnpjAccess } from "../../../subscriptions/utils/checkBarbershopAccess"

@injectable()
export class CreateBarbershopUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) { }

  async execute(data: ICreateBarbershopDTO): Promise<IBarbershopResponseDTO> {
    if (data.cnpj) {
      await checkCnpjAccess(data.cnpj);
    }

    return this.barbershopRepository.create(data);
  }
}