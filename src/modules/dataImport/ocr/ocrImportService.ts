/**
 * Serviço de importação por imagem (OCR).
 *
 * Orquestra: feature flag → fila (concorrência 1) → extração OCR → piso de
 * resolução → gravação do lote. O OCR roda **uma vez** por imagem.
 *
 * Nenhum erro daqui é genérico: fila cheia, imagem grande, formato inválido,
 * OCR desligado, traineddata ausente e resolução baixa têm código e
 * mensagem próprios (`OCR_ERROR_CODES`).
 */
import {
  OCR_ERROR_CODES,
  OCR_IMPORT_ENABLED,
  OCR_MIN_TABLE_WIDTH_PX_TELEFONE,
  OCR_MIN_TABLE_WIDTH_PX_VALOR,
  OCR_PREPROCESS,
} from "./ocr.constants";
import { validateAndPrepareImage, cleanupImage, type ValidatedImage } from "./ocrSecurity";
import { enqueueOcrJob, ocrQueueStats, ocrQueueCanEnqueue } from "./ocrQueue";
import { extrairImagem } from "./ocrExtractor";
import { preprocessOcrImage, dimensoesImagem } from "./ocrPreprocess";
import { salvarArquivoLoteOcr } from "./ocrBatchFile";
import { readFile } from "node:fs/promises";
import { AppError } from "@/shared/errors/AppError";
import { getModuleLogger } from "@/shared/utils/logger";
import type { OcrCellResult } from "./ocr.types";

const logger = getModuleLogger("data-import:ocr-service");

export interface OcrImportResult {
  /** Caminho do CSV do lote (a tabela lida da imagem). */
  filePath: string;
  /** Cabeçalhos genéricos da tabela ("Coluna 1"…). */
  headers: string[];
  /** Células com confiança, por linha. */
  celulas: OcrCellResult[][];
  /** Quantidade de linhas lidas. */
  totalRows: number;
  /** Metadados de operação (sem valores de célula — só contagens/tempo/RAM). */
  operacao: {
    imagens: number;
    tempoOcrMs: number;
    ramPicoBytes: number;
    fila: ReturnType<typeof ocrQueueStats>;
    /** Largura da região da tabela, na escala da imagem original. */
    larguraTabelaPx: number;
    /** Largura da imagem original. */
    larguraImagemPx: number;
    /** A tabela está abaixo do piso de resolução? */
    abaixoDoPiso: boolean;
    /** Pré-processamento ligado nesta importação? */
    preprocessAtivo: boolean;
    /** Tempo do pré-processamento (ms). */
    tempoPreprocessMs: number;
    /** Largura da imagem que o OCR leu (depois do pré-processamento). */
    larguraProcessadaPx: number;
  };
  /** Aviso quando o valor lido fica abaixo do piso de 924 px (não bloqueia). */
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
 * Importa uma imagem via OCR: lê a tabela, grava o lote e devolve o caminho
 * do CSV com as células e a confiança.
 */
export async function importarImagemOcr(
  fileName: string,
  buffer: Buffer,
): Promise<OcrImportResult> {
  if (!OCR_IMPORT_ENABLED) {
    throw new AppError(
      "A importação por imagem está desativada. Ative OCR_IMPORT_ENABLED=on para enviar fotos.",
      400,
      undefined,
      OCR_ERROR_CODES.desativado,
    );
  }

  if (!ocrQueueCanEnqueue()) {
    throw new AppError(
      "A fila de leitura de imagens está cheia. Tente enviar a imagem de novo em alguns instantes.",
      429,
      undefined,
      OCR_ERROR_CODES.filaCheia,
    );
  }

  const inicio = Date.now();
  let validated: ValidatedImage | null = null;

  try {
    // 1) Segurança: valida MIME por conteúdo, tamanho, pixels; redimensiona.
    validated = await validateAndPrepareImage(fileName, buffer);
    atualizarPicoRam();

    // 2) Pré-processamento (antes do OCR). A imagem preparada é a que o OCR
    //    lê: o limite de pixels (OCR_MAX_IMAGE_PIXELS) vale e o EXIF da foto
    //    de celular é aplicado. O pré-processamento é opcional por flag.
    const inicioPreprocess = Date.now();
    let imagemOcr: Buffer = await readFile(validated.ocrPath);
    if (OCR_PREPROCESS) {
      imagemOcr = await preprocessOcrImage(imagemOcr);
    }
    const tempoPreprocessMs = Date.now() - inicioPreprocess;
    const { larguraPx: larguraProcessadaPx } = await dimensoesImagem(imagemOcr);
    atualizarPicoRam();

    // 3) Fila de OCR (concorrência 1) — a extração roda dentro da fila, então
    //    a imagem é reconhecida uma única vez.
    const extraido = await enqueueOcrJob(() =>
      extrairImagem(imagemOcr, fileName, larguraProcessadaPx),
    );
    atualizarPicoRam();

    // 4) A largura da tabela é medida na escala da imagem ORIGINAL (orientada):
    //    nem o redimensionamento para OCR nem a rotação do deskew podem
    //    baixar a régua do piso.
    const escala =
      validated.larguraOrientadaPx > 0
        ? larguraProcessadaPx / validated.larguraOrientadaPx
        : 1;
    const larguraTabelaPx = Math.round(extraido.larguraTabelaPx / (escala || 1));

    if (!extraido.headers.length || extraido.headers.length < 2 || !extraido.celulas.length) {
      throw new AppError(
        "Não reconheci uma tabela nesta imagem. Enquadre a tabela na foto e tente de novo.",
        400,
        undefined,
        OCR_ERROR_CODES.semTabela,
      );
    }

    if (larguraTabelaPx < OCR_MIN_TABLE_WIDTH_PX_TELEFONE) {
      throw new AppError(
        `A tabela da imagem tem ${larguraTabelaPx} px de largura e o mínimo para ler telefone é ${OCR_MIN_TABLE_WIDTH_PX_TELEFONE} px. Tire a foto mais perto ou com mais resolução.`,
        400,
        undefined,
        OCR_ERROR_CODES.resolucaoBaixa,
      );
    }

    // 5) Grava o lote: o CSV da tabela + o arquivo lateral da revisão.
    const { filePath } = await salvarArquivoLoteOcr({
      headers: extraido.headers,
      celulas: extraido.celulas,
      larguraTabelaPx,
      larguraImagemPx: validated.larguraOrientadaPx,
    });

    const tempoOcrMs = Date.now() - inicio;
    const abaixoDoPisoValor = larguraTabelaPx < OCR_MIN_TABLE_WIDTH_PX_VALOR;

    // Log de operação: só contagens, dimensões e tempo — **nunca** o valor
    // lido na célula.
    logger.info(
      {
        preprocessAtivo: OCR_PREPROCESS,
        tempoPreprocessMs,
        tempoOcrMs,
        larguraProcessadaPx,
        larguraTabelaPx,
        linhas: extraido.celulas.length,
        colunas: extraido.headers.length,
        celulas: extraido.celulas.reduce((total, linha) => total + linha.length, 0),
      },
      "Importação por imagem lida",
    );

    return {
      filePath,
      headers: extraido.headers,
      celulas: extraido.celulas,
      totalRows: extraido.sheet.rows.length,
      operacao: {
        imagens: 1,
        tempoOcrMs,
        ramPicoBytes: memoriaPicoBytes,
        fila: ocrQueueStats(),
        larguraTabelaPx,
        larguraImagemPx: validated.larguraOrientadaPx,
        abaixoDoPiso: abaixoDoPisoValor,
        preprocessAtivo: OCR_PREPROCESS,
        tempoPreprocessMs,
        larguraProcessadaPx,
      },
      ...(abaixoDoPisoValor
        ? {
            avisoQualidade:
              `A tabela da foto tem ${larguraTabelaPx} px de largura: valores podem ser lidos errado (o mínimo para valor é ${OCR_MIN_TABLE_WIDTH_PX_VALOR} px). Confira os valores antes de confirmar.`,
          }
        : {}),
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
