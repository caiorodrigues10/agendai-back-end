import { inject, injectable } from "tsyringe";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { IUpdateBarbershopDTO } from "../../dtos/IUpdateBarbershopDTO";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";
import { geocodeCity } from "@/shared/services/geocodeCity";
import { resolveAudienceForSegment, normalizeSegmentOther } from "@/shared/segments";
import { assertShopAccess, type RequestingUser } from "../../utils/assertShopAccess";
import { invalidateSegmentCache } from "@/shared/segments/segmentCache";

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

    // Texto livre de OTHER: só persiste quando o segmento efetivo é OTHER;
    // trocar de segmento zera o texto antigo, e voltar para OTHER não recupera
    // o que foi digitado antes (deliberado — o texto descreve o segmento).
    if (
      data.businessSegment !== undefined ||
      data.targetAudience !== undefined ||
      data.businessSegmentOther !== undefined
    ) {
      const segment = data.businessSegment ?? shop?.businessSegment;
      if (segment) {
        const incoming =
          data.businessSegmentOther !== undefined
            ? data.businessSegmentOther
            : (shop?.businessSegmentOther ?? null);
        resolved = {
          ...resolved,
          businessSegmentOther: normalizeSegmentOther(segment, incoming),
        };
      }
    }

    const updated = await this.barbershopRepository.update(id, resolved);

    // O gate por segmento lê o segmento do cache: trocar o segmento tem que
    // invalidar a entrada, senão o painel esconde/mostra a aba errada por
    // até 60s.
    if (data.businessSegment !== undefined) {
      invalidateSegmentCache(id);
    }

    return updated;
  }
}
