import { inject, injectable } from "tsyringe";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { IUpdateBarbershopDTO } from "../../dtos/IUpdateBarbershopDTO";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";
import { geocodeCity } from "@/shared/services/geocodeCity";

@injectable()
export class UpdateBarbershopUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}
  async execute(id: string, data: IUpdateBarbershopDTO): Promise<IBarbershopResponseDTO> {
    let resolved = { ...data };

    if (data.city !== undefined) {
      if (!data.city?.trim()) {
        resolved = { ...resolved, city: null, latitude: null, longitude: null };
      } else if (data.latitude === undefined && data.longitude === undefined) {
        const location = await geocodeCity(data.city);
        resolved = { ...resolved, city: location.city, latitude: location.latitude, longitude: location.longitude };
      }
    }

    return this.barbershopRepository.update(id, resolved);
  }
}
