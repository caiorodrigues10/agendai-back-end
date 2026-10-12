import { inject, injectable } from "tsyringe";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { IUpdateBarbershopDTO } from "../../dtos/IUpdateBarbershopDTO";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";
import { geocodeCity } from "@/shared/services/geocodeCity";
import { resolveAudienceForSegment } from "@/shared/segments";
import { assertShopAccess, type RequestingUser } from "../../utils/assertShopAccess";

@injectable()
export class UpdateBarbershopUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}
  async execute(
    id: string,
    data: IUpdateBarbershopDTO,
    requestingUser: RequestingUser | undefined,
  ): Promise<IBarbershopResponseDTO> {
    assertShopAccess(requestingUser, id);
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

    // O par segmento/público é normalizado junto: trocar para PETSHOP não pode
    // deixar um "Masculino" antigo colado, e mandar só o público num petshop
    // zera em vez de gravar algo que o segmento não usa. Nunca mexe em serviços
    // já criados — o catálogo só nasce no seed do cadastro.
    if (data.businessSegment !== undefined || data.targetAudience !== undefined) {
      const segment = data.businessSegment ?? shop?.businessSegment;
      const audience =
        data.targetAudience !== undefined ? data.targetAudience : (shop?.targetAudience ?? null);
      if (segment) {
        resolved = { ...resolved, targetAudience: resolveAudienceForSegment(segment, audience) };
      }
    }

    return this.barbershopRepository.update(id, resolved);
  }
}
