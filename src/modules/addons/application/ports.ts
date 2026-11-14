import type {
  AddonCatalogEntry,
  AddonSelectionItem,
  AddonSnapshot,
} from "../domain/addonTypes";

/** DTO de adicional do catálogo — reais (número), pronto para a API. */
export interface SalonAddonDto {
  id: string;
  barbershopId: string;
  name: string;
  description: string | null;
  price: number;
  durationMinutes: number;
  active: boolean;
  availableOnline: boolean;
  maxQuantity: number;
  commissionable: boolean;
  sortOrder: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Vínculo serviço ↔ adicional com overrides (reais / minutos). */
export interface ServiceAddonLinkDto {
  id: string;
  barbershopId: string;
  serviceId: string;
  addonId: string;
  priceOverride: number | null;
  timeOverride: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  addon?: Pick<
    SalonAddonDto,
    | "id"
    | "name"
    | "price"
    | "durationMinutes"
    | "active"
    | "availableOnline"
    | "maxQuantity"
    | "commissionable"
  >;
}

export interface CreateSalonAddonInput {
  name: string;
  description?: string | null;
  price: number;
  durationMinutes?: number;
  active?: boolean;
  availableOnline?: boolean;
  maxQuantity?: number;
  commissionable?: boolean;
  sortOrder?: number;
}

export interface UpdateSalonAddonInput {
  name?: string;
  description?: string | null;
  price?: number;
  durationMinutes?: number;
  active?: boolean;
  availableOnline?: boolean;
  maxQuantity?: number;
  commissionable?: boolean;
  sortOrder?: number;
}

export interface ServiceAddonLinkInput {
  addonId: string;
  priceOverride?: number | null;
  timeOverride?: number | null;
  sortOrder?: number;
}

/** Porta de leitura do catálogo usada pela validação de seleção (Fase 3). */
export interface AddonCatalogReader {
  listCatalogEntriesForService(
    barbershopId: string,
    serviceId: string
  ): Promise<AddonCatalogEntry[]>;
  loadSnapshots(
    barbershopId: string,
    serviceId: string,
    selection: readonly AddonSelectionItem[]
  ): Promise<AddonSnapshot[]>;
}

/** Porta de persistência do catálogo de adicionais do salão. */
export interface ISalonAddonRepository {
  list(
    barbershopId: string,
    filters?: { serviceId?: string; includeDeleted?: boolean }
  ): Promise<SalonAddonDto[]>;
  findById(barbershopId: string, id: string): Promise<SalonAddonDto | null>;
  create(barbershopId: string, input: CreateSalonAddonInput): Promise<SalonAddonDto>;
  update(
    barbershopId: string,
    id: string,
    input: UpdateSalonAddonInput
  ): Promise<SalonAddonDto>;
  softDelete(barbershopId: string, id: string): Promise<void>;
}

/** Porta de persistência dos vínculos serviço ↔ adicional. */
export interface IServiceAddonLinkRepository {
  listByService(barbershopId: string, serviceId: string): Promise<ServiceAddonLinkDto[]>;
  replaceForService(
    barbershopId: string,
    serviceId: string,
    links: readonly ServiceAddonLinkInput[]
  ): Promise<ServiceAddonLinkDto[]>;
}
