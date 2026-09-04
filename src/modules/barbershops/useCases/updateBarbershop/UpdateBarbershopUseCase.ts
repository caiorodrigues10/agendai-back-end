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
    const shop = await this.barbershopRepository.findById(id);

    if (data.city !== undefined) {
      if (!data.city?.trim()) {
        resolved = { ...resolved, city: null, latitude: null, longitude: null };
      } else {
        const nextCity = data.city.trim();
        const cityChanged =
          (shop?.city ?? "").trim().toLowerCase() !== nextCity.toLowerCase();
        const lat = data.latitude !== undefined ? data.latitude : shop?.latitude;
        const lng = data.longitude !== undefined ? data.longitude : shop?.longitude;
        if (cityChanged || lat == null || lng == null) {
          const location = await geocodeCity(nextCity);
          resolved = {
            ...resolved,
            city: location.city,
            latitude: location.latitude,
            longitude: location.longitude,
          };
        }
      }
    }

    return this.barbershopRepository.update(id, resolved);
  }
}
