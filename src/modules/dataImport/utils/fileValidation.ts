/**
 * Validação de segurança do arquivo enviado na importação.
 *
 * Regra central (Fase 1): **o formato vem do conteúdo** (magic bytes), nunca
 * da extensão nem do mimetype. A extensão é escrita por quem exportou a
 * planilha e mente com frequência: `.csv` que é XLSX, `.xlsx` que é CSV,
 * `.xls` que é HTML. A assinatura do arquivo não mente.
 *
 * Regras aplicadas (todas antes de qualquer leitura da planilha):
 *   • tamanho máximo;
 *   • detecção do formato pelo conteúdo;
 *   • guarda de ZIP (bomba e número de entradas) para os formatos que são ZIP;
 *   • nome do arquivo sanitizado para exibição.
 *
 * O nome do arquivo enviado NUNCA é usado para montar caminho: o servidor
 * grava com um nome próprio (uuid), o que evita path traversal e colisão.
 */
import {
  IMPORT_FORMAT_EXTENSIONS,
  IMPORT_SUPPORTED_FORMATS_LABEL,
  MAX_IMPORT_FILE_SIZE_BYTES,
} from "../dataImport.constants";
import type { ImportFileFormat } from "../dataImport.types";
import { AppError } from "@/shared/errors/AppError";
import { detectImportFormat } from "./formatDetector";
import { inspectZip, ZipGuardError } from "./zipGuard";
import { inspectOle2 } from "./oleGuard";
import { inspectPdf } from "./pdfGuard";

export interface ValidatedImportFile {
  /** Formato detectado pelo conteúdo. */
  format: ImportFileFormat;
  /** Extensão canônica do formato detectado (não a do nome enviado). */
  extension: string;
  /** Nome para exibição, sem caminho. */
  fileName: string;
  fileSize: number;
}

/**
 * Valida o arquivo e devolve o formato detectado. Lança `AppError` com
 * mensagem adequada para o usuário final.
 */
export function validateImportFile(fileName: string, buffer: Buffer): ValidatedImportFile {
  if (!buffer || buffer.length === 0) {
    throw new AppError("O arquivo enviado está vazio.", 400);
  }

  if (buffer.length > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new AppError(
      `O arquivo passa de ${Math.round(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024))} MB. Envie um arquivo menor.`,
      413,
    );
  }

  // O formato vem da assinatura do conteúdo — a extensão do nome é ignorada.
  const format = detectImportFormat(buffer);

  // Os formatos que são ZIP passam pela guarda antes de qualquer descompactação.
  if (format === "XLSX" || format === "XLSM" || format === "ODS") {
    try {
      inspectZip(buffer);
    } catch (err) {
      if (err instanceof ZipGuardError) {
        throw new AppError(err.message, 400);
      }
      throw new AppError("Não foi possível ler a planilha enviada.", 400);
    }
  }

  // O `.xls` declara o tamanho dos streams no cabeçalho OLE2 e o PDF declara
  // o tamanho dos objetos: os dois podem mentir. A guarda roda **aqui**,
  // no upload, para o arquivo traiçoeiro nunca nem chegar a ser gravado.
  if (format === "XLS") {
    inspectOle2(buffer);
  }
  if (format === "PDF") {
    inspectPdf(buffer);
  }

  return {
    format,
    extension: IMPORT_FORMAT_EXTENSIONS[format],
    fileName: sanitizeFileName(fileName),
    fileSize: buffer.length,
  };
}

/**
 * Nome do arquivo para exibição. Remove caminho e caracteres de controle —
 * o valor original nunca vira caminho em disco.
 */
export function sanitizeFileName(fileName: string): string {
  const base = String(fileName || "").split(/[\\/]/).pop() ?? "planilha";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/["*:<>?|]/g, "")
    .trim();
  return (cleaned || "planilha").slice(0, 255);
}

/** Texto de ajuda para o dono (usado nas mensagens do sistema). */
export const IMPORT_FORMATS_HELP = IMPORT_SUPPORTED_FORMATS_LABEL;
