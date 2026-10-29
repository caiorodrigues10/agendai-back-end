import type { BusinessSegment } from "@prisma/client";

/**
 * Gate genérico por segmento.
 *
 * Uma única configuração declara, por segmento, o que **não** existe para
 * aquele tipo de estabelecimento. A mesma lista serve para:
 *  - esconder abas/módulos na UI (espelho em `frontend/src/config/segmentGate.ts`);
 *  - negar endpoints dedicados na API (middleware `segmentModuleGuard`).
 *
 * Regra: o gate é por segmento, nunca por `if/else` espalhado. Quem precisa
 * de um novo comportamento acrescenta uma entrada aqui — não um desvio em
 * componentes isolados.
 */

/** Módulos com endpoint dedicado que podem ser ocultados por segmento. */
export type GatedModule = "products" | "equipment" | "commissions" | "tip";

export interface SegmentGateConfig {
  /** Ids de aba do painel ocultas neste segmento (mesmos ids do tabRegistry). */
  hiddenTabs: string[];
  /** Módulos negados na API neste segmento. */
  hiddenModules: GatedModule[];
}

const EMPTY_GATE: SegmentGateConfig = { hiddenTabs: [], hiddenModules: [] };

/**
 * Configuração por segmento. Segmento ausente = tudo liberado.
 *
 * LAW_FIRM (advocacia): sem venda de produtos, sem estoque de equipamento,
 * sem comissão por atendimento e sem gorjeta — o repository é honorários.
 */
export const SEGMENT_GATE_CONFIG: Partial<Record<BusinessSegment, SegmentGateConfig>> = {
  LAW_FIRM: {
    hiddenTabs: ["products", "equipment"],
    hiddenModules: ["products", "equipment", "commissions", "tip"],
  },
};

/** Gate do segmento (vazio quando o segmento não tem restrição). */
export function getSegmentGate(
  segment: BusinessSegment | null | undefined
): SegmentGateConfig {
  if (!segment) return EMPTY_GATE;
  return SEGMENT_GATE_CONFIG[segment] ?? EMPTY_GATE;
}

/** O módulo está liberado para o segmento? */
export function isModuleEnabled(
  segment: BusinessSegment | null | undefined,
  module: GatedModule
): boolean {
  return !getSegmentGate(segment).hiddenModules.includes(module);
}

/** A aba está liberada para o segmento? */
export function isTabEnabled(
  segment: BusinessSegment | null | undefined,
  tabId: string
): boolean {
  return !getSegmentGate(segment).hiddenTabs.includes(tabId);
}
