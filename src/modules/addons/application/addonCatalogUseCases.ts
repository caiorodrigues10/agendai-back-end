import { inject, injectable } from "tsyringe";
import { AddonSelectionError } from "../domain/addonTypes";
import { validateAddonSelection } from "../domain/validateAddonSelection";
import type {
  CreateSalonAddonInput,
  IServiceAddonLinkRepository,
  ISalonAddonRepository,
  ServiceAddonLinkDto,
  ServiceAddonLinkInput,
  UpdateSalonAddonInput,
  SalonAddonDto,
} from "./ports";
import { MESSAGES } from "@/shared/messages/pt-BR";
import { AppError } from "@/shared/errors/AppError";

export const SALON_ADDON_REPOSITORY = "SalonAddonRepository";
export const SERVICE_ADDON_LINK_REPOSITORY = "ServiceAddonLinkRepository";

function mapSelectionError(err: unknown): never {
  if (err instanceof AddonSelectionError) {
    switch (err.code) {
      case "ADDON_NOT_FOUND":
      case "ADDON_INACTIVE":
      case "ADDON_NOT_LINKED":
        throw new AppError(MESSAGES.addons.addonNotLinked, 400, undefined, err.code);
      case "QUANTITY_OUT_OF_RANGE":
        throw new AppError(MESSAGES.addons.quantityOutOfRange, 400, undefined, err.code);
      case "TOO_MANY_DISTINCT":
        throw new AppError(
          MESSAGES.addons.tooManyDistinctAddons,
          400,
          undefined,
          err.code
        );
      default:
        throw new AppError(MESSAGES.addons.priceInvalid, 400, undefined, err.code);
    }
  }
  throw err;
}

/**
 * Casos de uso do catálogo de adicionais (FASE 2).
 * Camada application: sem Prisma/Fastify — só portas + domínio.
 */
@injectable()
export class AddonCatalogUseCases {
  constructor(
    @inject(SALON_ADDON_REPOSITORY)
    private readonly addonRepo: ISalonAddonRepository,
    @inject(SERVICE_ADDON_LINK_REPOSITORY)
    private readonly linkRepo: IServiceAddonLinkRepository
  ) {}

  async listAddons(
    barbershopId: string,
    filters?: { serviceId?: string; includeDeleted?: boolean }
  ): Promise<SalonAddonDto[]> {
    return this.addonRepo.list(barbershopId, filters);
  }

  async getAddon(barbershopId: string, id: string): Promise<SalonAddonDto> {
    const addon = await this.addonRepo.findById(barbershopId, id);
    if (!addon) throw new AppError(MESSAGES.addons.notFound, 404);
    return addon;
  }

  async createAddon(
    barbershopId: string,
    input: CreateSalonAddonInput
  ): Promise<SalonAddonDto> {
    if (!input.name?.trim()) {
      throw new AppError(MESSAGES.addons.nameRequired, 400);
    }
    if (!Number.isFinite(input.price) || input.price < 0) {
      throw new AppError(MESSAGES.addons.priceInvalid, 400);
    }
    return this.addonRepo.create(barbershopId, input);
  }

  async updateAddon(
    barbershopId: string,
    id: string,
    input: UpdateSalonAddonInput
  ): Promise<SalonAddonDto> {
    const existing = await this.getAddon(barbershopId, id);
    if (input.name !== undefined && !input.name.trim()) {
      throw new AppError(MESSAGES.addons.nameRequired, 400);
    }
    if (input.price !== undefined && (!Number.isFinite(input.price) || input.price < 0)) {
      throw new AppError(MESSAGES.addons.priceInvalid, 400);
    }
    return this.addonRepo.update(barbershopId, existing.id, input);
  }

  async deleteAddon(barbershopId: string, id: string): Promise<void> {
    await this.getAddon(barbershopId, id);
    await this.addonRepo.softDelete(barbershopId, id);
  }

  async listServiceAddonLinks(
    barbershopId: string,
    serviceId: string
  ): Promise<ServiceAddonLinkDto[]> {
    return this.linkRepo.listByService(barbershopId, serviceId);
  }

  /** PUT = substitui todos os vínculos do serviço (idempotente). */
  async replaceServiceAddonLinks(
    barbershopId: string,
    serviceId: string,
    links: readonly ServiceAddonLinkInput[]
  ): Promise<ServiceAddonLinkDto[]> {
    for (const link of links) {
      if (link.priceOverride !== undefined && link.priceOverride !== null) {
        if (!Number.isFinite(link.priceOverride) || link.priceOverride < 0) {
          throw new AppError(MESSAGES.addons.invalidOverride, 400);
        }
      }
      if (link.timeOverride !== undefined && link.timeOverride !== null) {
        if (!Number.isInteger(link.timeOverride) || link.timeOverride < 0) {
          throw new AppError(MESSAGES.addons.invalidOverride, 400);
        }
      }
    }
    const ids = links.map((l) => l.addonId);
    if (new Set(ids).size !== ids.length) {
      throw new AppError(MESSAGES.addons.duplicateAddonLink, 400);
    }
    // Garante que todos os adicionais pertencem ao salão.
    for (const id of ids) {
      await this.getAddon(barbershopId, id);
    }
    return this.linkRepo.replaceForService(barbershopId, serviceId, links);
  }

  /**
   * Valida uma seleção de adicionais contra o catálogo do serviço.
   * Usado pela Fase 3 (agendamento); exposto aqui para testes de domínio
   * via aplicação sem tocar no fluxo de criação.
   */
  async validateSelection(
    barbershopId: string,
    serviceId: string,
    items: readonly { addonId: string; quantity: number }[],
    catalog: readonly {
      addonId: string;
      active: boolean;
      linked: boolean;
      maxQuantity: number;
    }[]
  ): Promise<{ addonId: string; quantity: number }[]> {
    void barbershopId;
    void serviceId;
    try {
      return validateAddonSelection(items, catalog);
    } catch (err) {
      mapSelectionError(err);
    }
  }
}
