/**
 * Snapshot imutável de uma linha de adicional escolhida em um agendamento.
 * Valores monetários em centavos inteiros.
 */
export interface AddonSnapshot {
  addonId: string;
  name: string;
  /** Preço unitário efetivo em centavos (override do vínculo, se houver). */
  unitPriceCents: number;
  quantity: number;
  /** Duração em minutos de UMA unidade (override do vínculo, se houver). */
  durationMinutes: number;
  commissionable: boolean;
}

/** Item de escolha enviado na criação/edição do agendamento (API). */
export interface AddonSelectionItem {
  addonId: string;
  quantity: number;
}

/**
 * Estado do adicional no catálogo, no contexto de um serviço — entrada da
 * validação de seleção (atividade, vínculo e limite de quantidade).
 */
export interface AddonCatalogEntry {
  addonId: string;
  active: boolean;
  linked: boolean;
  maxQuantity: number;
}

/** Limite de adicionais distintos por agendamento (decisão FASE 0 #11). */
export const MAX_DISTINCT_ADDONS = 10;

export type AddonValidationError =
  | "ADDON_NOT_FOUND"
  | "ADDON_INACTIVE"
  | "ADDON_NOT_LINKED"
  | "QUANTITY_OUT_OF_RANGE"
  | "TOO_MANY_DISTINCT";

export class AddonSelectionError extends Error {
  public readonly code: AddonValidationError;
  public readonly addonId?: string;

  constructor(code: AddonValidationError, addonId?: string) {
    super(code);
    this.name = "AddonSelectionError";
    this.code = code;
    this.addonId = addonId;
  }
}
