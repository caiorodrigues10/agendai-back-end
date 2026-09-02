import { inject, injectable } from "tsyringe";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { ICreateBarbershopDTO } from "../../dtos/ICreateBarbershopDTO";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";
import { checkCnpjAccess } from "../../../subscriptions/utils/checkBarbershopAccess"
import { geocodeCity } from "@/shared/services/geocodeCity";

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

    let resolved = { ...data };
    if (data.city && data.latitude === undefined && data.longitude === undefined) {
      const location = await geocodeCity(data.city);
      resolved = { ...resolved, city: location.city, latitude: location.latitude, longitude: location.longitude };
    }
    return this.barbershopRepository.create(resolved);
  }
}
