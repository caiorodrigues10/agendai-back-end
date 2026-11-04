/**
 * Destinos que uma imagem pode atender.
 *
 * A imagem vira uma tabela com cabeçalhos genéricos ("Coluna 1"…): quem
 * decide o **destino** (o que importar) e o **mapeamento** (qual coluna é
 * qual campo) é o dono, na etapa de mapeamento — o mesmo fluxo da planilha.
 *
 * O que a foto **não** garante é a forma de cada coluna. Por isso cada
 * destino lista os campos obrigatórios: sem eles no mapa, a importação é
 * recusada (`saveMapping`) em vez de inventar dado.
 */
import { IMPORT_TARGET_LABELS } from "../dataImport.constants";
import { availableFields } from "../utils/columnMapping";
import type { ImportFieldKey, ImportTargetType } from "../dataImport.types";
import type { BusinessSegment } from "@prisma/client";

export interface OcrDestino {
  targetType: ImportTargetType;
  /** Rótulo do destino. */
  rotulo: string;
  /** Campos obrigatórios: a foto precisa mostrar uma coluna para cada um. */
  obrigatorios: ImportFieldKey[];
  /** O que a leitura por foto não garante neste destino. */
  observacao: string;
}

/** Observações honestas por destino (o que ainda falta para a imagem). */
const OBSERVACOES: Partial<Record<ImportTargetType, string>> = {
  CLIENTS:
    "Nome e WhatsApp são obrigatórios: a foto precisa mostrar as duas colunas.",
  APPOINTMENTS:
    "Data e hora são obrigatórias: sem as duas colunas legíveis, o agendamento não entra.",
  STAFF_SCHEDULES:
    "Dia da semana, início e fim são obrigatórios: a foto precisa mostrar os horários.",
  SHOP_SCHEDULE:
    "Dia da semana, abre e fecha são obrigatórios.",
  TIME_OFF:
    "Data inicial e data final são obrigatórias: a foto precisa mostrar o período.",
  CASES:
    "O número do processo (CNJ) lido de foto é frágil: a célula vai para revisão quando a confiança é baixa.",
  CASE_FEES:
    "Número do processo (caseNumber) e percentual do honorário (percent) são obrigatórios: sem as duas colunas na foto o mapa é recusado. O OCR não garante o CNJ — a célula vai para revisão quando a confiança é baixa.",
  CLIENT_PACKAGES:
    "WhatsApp, pacote e sessões totais são obrigatórios: a foto precisa mostrar as três colunas.",
  SERVICE_PACKAGES:
    "Nome do pacote, serviço e sessões são obrigatórios: o serviço tem de existir no catálogo.",
};

/** Destinos que uma imagem pode atender, com o que falta em cada um. */
export function destinosOcr(segment?: BusinessSegment | null): OcrDestino[] {
  const targets: ImportTargetType[] = [
    "CLIENTS",
    "SERVICES",
    "APPOINTMENTS",
    "STAFF_SCHEDULES",
    "SHOP_SCHEDULE",
    "TIME_OFF",
    "PRODUCTS",
    "SERVICE_PACKAGES",
    "CLIENT_PACKAGES",
    "FIADOS",
    "CASES",
    "CASE_FEES",
  ];

  return targets.map((targetType) => ({
    targetType,
    rotulo: IMPORT_TARGET_LABELS[targetType],
    obrigatorios: availableFields(targetType, segment)
      .filter((field) => field.required)
      .map((field) => field.key),
    observacao:
      OBSERVACOES[targetType] ??
      "A foto precisa mostrar uma coluna para cada campo obrigatório do destino.",
  }));
}
