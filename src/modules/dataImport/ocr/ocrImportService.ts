/**
 * Serviço de importação por imagem (OCR).
 *
 * Orquestra: validação de segurança → fila (concorrência 1) → extração OCR →
 * gate de falso confiante. Devolve `ParsedSheet[]` no mesmo formato das
 * planilhas para reusar o pipeline existente, mais metadados de operação.
 *
 * Sem gravação direta: a importação por imagem entra em estado de revisão.
 */
import { OCR_IMPORT_ENABLED } from "./ocr.constants";
import { validateAndPrepareImage, cleanupImage, ValidatedImage } from "./ocrSecurity";
import { enqueueOcrJob, ocrQueueStats, ocrQueueCanEnqueue } from "./ocrQueue";
import { extrairImagem, OcrSheetResult, OcrCellResult } from "./ocrExtractor";
import { gateOcrLinha, OCR_CRITICAL_FIELDS } from "./falseConfidenceGate";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("data-import:ocr-service");

export interface OcrImportResult {
  sheets: Array<{ sheet: import("../dataImport.types").ParsedSpreadsheet; celulas: OcrCellResult[][] }>;
  /** Metadados de operação (sem valores de célula — só contagens/tempo/RAM). */
  operacao: {
    imagens: number;
    tempoOcrMs: number;
    ramPicoBytes: number;
    fila: ReturnType<typeof ocrQueueStats>;
    larguraPx: number;
    abaixoDoPiso: boolean;
  };
  /** Aviso quando abaixo do piso de resolução (não bloqueia). */
  avisoQualidade?: string;
}

let memoriaPicoBytes = 0;

/** Atualiza o pico aproximado de RAM do processo. */
function atualizarPicoRam(): void {
  const m = process.memoryUsage();
  const atual = m.heapUsed + m.external + m.rss;
  if (atual > memoriaPicoBytes) memoriaPicoBytes = atual;
}

/**
 * Importa uma imagem via OCR. Lança AppError com mensagem clara em caso de
 * fila cheia, formato inválido, imagem grande ou OCR desligado.
 */
export async function importarImagemOcr(
  fileName: string,
  buffer: Buffer,
): Promise<OcrImportResult> {
  if (!OCR_IMPORT_ENABLED) {
    throw new Error("OCR_IMPORT_ENABLED=off");
  }

  if (!ocrQueueCanEnqueue()) {
    throw new Error(
      "Fila de OCR cheia. Tente importar a imagem em alguns instantes.",
    );
  }

  const inicio = Date.now();
  let validated: ValidatedImage | null = null;

  try {
    // 1) Segurança: valida MIME por conteúdo, tamanho, pixels; redimensiona.
    validated = await validateAndPrepareImage(fileName, buffer);
    atualizarPicoRam();

    // 2) Fila de OCR (concorrência 1).
    await enqueueOcrJob(buffer, validated.fileName);
    atualizarPicoRam();

    // 3) Extração OCR em ParsedSheet (usa o buffer original, já em memória).
    const extraido = await extrairImagem(buffer, validated.fileName);
    atualizarPicoRam();

    const tempoOcrMs = Date.now() - inicio;
    const abaixoDoPiso =
      extraido.larguraPx < 693; // OCR_MIN_TABLE_WIDTH_PX_TELEFONE

    const avisoQualidade = abaixoDoPiso
      ? "Qualidade baixa: revise todas as células antes de confirmar."
      : undefined;

    return {
      sheets: [{ sheet: extraido.sheet, celulas: extraido.celulas }],
      operacao: {
        imagens: 1,
        tempoOcrMs,
        ramPicoBytes: memoriaPicoBytes,
        fila: ocrQueueStats(),
        larguraPx: extraido.larguraPx,
        abaixoDoPiso,
      },
      avisoQualidade,
    };
  } finally {
    if (validated) await cleanupImage(validated);
    atualizarPicoRam();
  }
}

/** Estatísticas de operação do OCR (para métricas de log). */
export function ocrOperacaoStats() {
  return {
    fila: ocrQueueStats(),
    ramPicoBytes: memoriaPicoBytes,
    enabled: OCR_IMPORT_ENABLED,
  };
}

export { OCR_CRITICAL_FIELDS };
