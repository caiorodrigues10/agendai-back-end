import type { BusinessSegment } from "@prisma/client";
import { SEGMENT_CONFIGS } from "./index";
import { getSegmentGate, type GatedModule } from "./segmentGate";

/** Módulos com endpoint dedicado que o gate por segmento pode ocultar. */
export const SEGMENT_GATED_MODULES: GatedModule[] = [
  "products",
  "equipment",
  "commissions",
  "tip",
];

export type SegmentSummary = {
  segment: BusinessSegment;
  group: string;
  label: string;
  features: string[];
  advertisingRestricted: boolean;
  auxiliaryProfile: string | null;
  hiddenModules: GatedModule[];
  visibleModules: GatedModule[];
  hiddenTabs: string[];
};

/** Resumo do que o segmento habilita — usado no catálogo do painel master. */
export function segmentSummary(segment: BusinessSegment): SegmentSummary {
  const config = SEGMENT_CONFIGS[segment];
  const gate = getSegmentGate(segment);
  return {
    segment,
    group: config.group,
    label: config.labels.segmentLabel,
    features: config.features ?? [],
    advertisingRestricted: config.advertisingRestricted === true,
    auxiliaryProfile: config.auxiliaryProfile ?? null,
    hiddenModules: [...gate.hiddenModules],
    visibleModules: SEGMENT_GATED_MODULES.filter(
      (module) => !gate.hiddenModules.includes(module),
    ),
    hiddenTabs: [...gate.hiddenTabs],
  };
}

export type SegmentImpact = {
  from: BusinessSegment;
  to: BusinessSegment;
  /** Módulos que existiam no segmento atual e passam a ser ocultados. */
  hiddenModules: GatedModule[];
  /** Módulos que estavam ocultados e passam a ficar disponíveis. */
  shownModules: GatedModule[];
  hiddenTabs: string[];
  shownTabs: string[];
  /** Features do segmento atual que o novo segmento não tem. */
  lostFeatures: string[];
  gainedFeatures: string[];
  /** `restricted` = passa a não divulgar; `unrestricted` = volta a divulgar. */
  advertisingChange: "restricted" | "unrestricted" | "none";
};

/**
 * Diferença de impacto entre dois segmentos: o que passa a sumir e o que
 * passa a existir. Calculado por configuração (gate + features do catálogo),
 * nunca por `if (segment === ...)` espalhado.
 */
export function diffSegmentImpact(
  from: BusinessSegment,
  to: BusinessSegment,
): SegmentImpact {
  const current = segmentSummary(from);
  const target = segmentSummary(to);
  const lostFeatures = current.features.filter(
    (feature) => !target.features.includes(feature),
  );
  const gainedFeatures = target.features.filter(
    (feature) => !current.features.includes(feature),
  );

  let advertisingChange: SegmentImpact["advertisingChange"] = "none";
  if (!current.advertisingRestricted && target.advertisingRestricted) {
    advertisingChange = "restricted";
  } else if (current.advertisingRestricted && !target.advertisingRestricted) {
    advertisingChange = "unrestricted";
  }

  return {
    from,
    to,
    hiddenModules: current.visibleModules.filter((module) =>
      target.hiddenModules.includes(module),
    ),
    shownModules: current.hiddenModules.filter((module) =>
      target.visibleModules.includes(module),
    ),
    hiddenTabs: current.hiddenTabs.filter((tab) => !target.hiddenTabs.includes(tab)),
    shownTabs: current.hiddenTabs.filter((tab) => target.hiddenTabs.includes(tab)),
    lostFeatures,
    gainedFeatures,
    advertisingChange,
  };
}
