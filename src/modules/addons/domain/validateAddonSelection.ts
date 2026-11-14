import {
  AddonSelectionError,
  MAX_DISTINCT_ADDONS,
  type AddonCatalogEntry,
  type AddonSelectionItem,
} from "./addonTypes";

/**
 * Valida a escolha de adicionais de um agendamento (domínio puro).
 *
 * Regras (FASE 0 #11):
 *  - quantidade por item em 1..maxQuantity;
 *  - só adicional `active` e `linked` ao serviço;
 *  - itens duplicados do mesmo addonId são somados antes da checagem de limite;
 *  - no máximo 10 adicionais distintos.
 *
 * Lança `AddonSelectionError` com código estável; a camada de aplicação
 * mapeia para `AppError` com a mensagem pt-BR do catálogo central.
 */
export function validateAddonSelection(
  items: readonly AddonSelectionItem[],
  catalog: readonly AddonCatalogEntry[]
): AddonSelectionItem[] {
  if (items.length === 0) {
    return [];
  }

  const byId = new Map<string, AddonCatalogEntry>(
    catalog.map((entry) => [entry.addonId, entry])
  );

  // Soma duplicados do mesmo addonId.
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new AddonSelectionError("QUANTITY_OUT_OF_RANGE", item.addonId);
    }
    totals.set(item.addonId, (totals.get(item.addonId) ?? 0) + item.quantity);
  }

  if (totals.size > MAX_DISTINCT_ADDONS) {
    throw new AddonSelectionError("TOO_MANY_DISTINCT");
  }

  const normalized: AddonSelectionItem[] = [];
  for (const [addonId, quantity] of totals) {
    const entry = byId.get(addonId);
    if (!entry) {
      throw new AddonSelectionError("ADDON_NOT_FOUND", addonId);
    }
    if (!entry.active) {
      throw new AddonSelectionError("ADDON_INACTIVE", addonId);
    }
    if (!entry.linked) {
      throw new AddonSelectionError("ADDON_NOT_LINKED", addonId);
    }
    if (quantity > entry.maxQuantity) {
      throw new AddonSelectionError("QUANTITY_OUT_OF_RANGE", addonId);
    }
    normalized.push({ addonId, quantity });
  }

  return normalized;
}
