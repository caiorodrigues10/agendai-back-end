import type { AppTx } from "@/libs/prismaClient";
import { toCents } from "../domain/money";
import type {
  AddonCatalogEntry,
  AddonSelectionItem,
  AddonSnapshot,
} from "../domain/addonTypes";
import { validateAddonSelection } from "../domain/validateAddonSelection";
import { AddonSelectionError } from "../domain/addonTypes";
import { MESSAGES } from "@/shared/messages/pt-BR";
import { AppError } from "@/shared/errors/AppError";

/** Público só enxerga adicional com `availableOnline` (decisão FASE 0). */
export type AddonVisibility = "staff" | "public";

export function mapAddonSelectionError(err: unknown): never {
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

type LinkRow = {
  addonId: string;
  priceOverride: unknown;
  timeOverride: number | null;
  addon: {
    name: string;
    price: unknown;
    durationMinutes: number;
    active: boolean;
    availableOnline: boolean;
    maxQuantity: number;
    commissionable: boolean;
  };
};

/**
 * Valida a seleção de adicionais de um agendamento contra o catálogo do
 * serviço e devolve os SNAPSHOTS a gravar (nome, preço/tempo efetivo com
 * overrides do vínculo, comissionabilidade) — domínio FASE 0/2 aplicado ao
 * fluxo de criação (FASE 3).
 *
 * - `visibility: "public"` restringe a `availableOnline` (portal não enxerga
 *   adicional fora do online, mesmo que ativo e vinculado);
 * - escopo sempre `barbershopId` + `serviceId` (dois salões não se cruzam);
 * - lançar `AppError` 400 pt-BR via `mapAddonSelectionError`.
 *
 * `db` deve ser o cliente da transação de criação (mesma consistência de
 * leitura do conflito de horário).
 */
export async function resolveAddonSelection(
  db: AppTx,
  params: {
    barbershopId: string;
    serviceId: string;
    items: readonly AddonSelectionItem[];
    visibility?: AddonVisibility;
  }
): Promise<AddonSnapshot[]> {
  if (!params.items.length) return [];

  const visibility = params.visibility ?? "staff";
  const rows = (await db.serviceAddonLink.findMany({
    where: {
      barbershopId: params.barbershopId,
      serviceId: params.serviceId,
      // Defesa em profundidade: mesmo um vínculo persistido incorretamente
      // não permite atravessar a fronteira entre salões.
      service: { barbershopId: params.barbershopId },
      addon: {
        barbershopId: params.barbershopId,
        deletedAt: null,
      },
    },
    select: {
      addonId: true,
      priceOverride: true,
      timeOverride: true,
      addon: {
        select: {
          name: true,
          price: true,
          durationMinutes: true,
          active: true,
          availableOnline: true,
          maxQuantity: true,
          commissionable: true,
        },
      },
    },
  })) as LinkRow[];

  const entries: AddonCatalogEntry[] = rows
    .filter((row) => visibility === "staff" || row.addon.availableOnline)
    .map((row) => ({
      addonId: row.addonId,
      active: row.addon.active,
      linked: true,
      maxQuantity: row.addon.maxQuantity,
    }));

  let normalized: AddonSelectionItem[];
  try {
    normalized = validateAddonSelection(params.items, entries);
  } catch (err) {
    mapAddonSelectionError(err);
  }

  const byId = new Map(rows.map((row) => [row.addonId, row]));
  return normalized.map((item) => {
    const row = byId.get(item.addonId);
    if (!row) {
      // Só alcançável se a validação acima passou com uma entrada que sumiu
      // entre as duas leituras — tratado como indisponível.
      mapAddonSelectionError(new AddonSelectionError("ADDON_NOT_FOUND", item.addonId));
    }
    const priceReais = row.priceOverride ?? row.addon.price;
    const durationMinutes = row.timeOverride ?? row.addon.durationMinutes;
    return {
      addonId: row.addonId,
      name: row.addon.name,
      unitPriceCents: toCents(Number(priceReais)),
      quantity: item.quantity,
      durationMinutes,
      commissionable: row.addon.commissionable,
    } satisfies AddonSnapshot;
  });
}
