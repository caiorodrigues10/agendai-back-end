/**
 * Fonte do `segmentParity.json` — o contrato lido pelo teste de paridade do
 * frontend (pacote separado, não importa este módulo).
 *
 * Um só lugar monta o objeto: o gerador escreve e a spec compara contra esta
 * função, então o JSON não tem como ficar desatualizado em silêncio.
 */
import {
  ALL_SEGMENTS,
  FIRST_CLASS_SEGMENTS,
  SEGMENT_CONFIGS,
  SEGMENT_LABEL_KEYS,
} from "./index";

export function buildSegmentParity() {
  return {
    _generatedBy: "backend/scripts/generateSegmentParity.ts — nao editar na mao",
    labelKeys: [...SEGMENT_LABEL_KEYS],
    allSegments: [...ALL_SEGMENTS],
    firstClassSegments: [...FIRST_CLASS_SEGMENTS],
    segments: Object.fromEntries(
      ALL_SEGMENTS.map((segment) => {
        const config = SEGMENT_CONFIGS[segment];
        return [
          segment,
          {
            firstClass: FIRST_CLASS_SEGMENTS.includes(segment),
            group: config.group,
            labels: config.labels,
            targetAudience: config.targetAudience,
            suggestedOperationMode: config.suggestedOperationMode,
            complianceNote: config.complianceNote ?? null,
            auxiliaryProfile: config.auxiliaryProfile ?? null,
            catalog: config.catalog,
            schedulePreset: config.schedulePreset,
          },
        ];
      }),
    ),
  };
}
