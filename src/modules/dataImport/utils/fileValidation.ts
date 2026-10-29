/**
 * Validação de segurança do arquivo enviado na importação.
 *
 * Regras aplicadas (todas antes de qualquer leitura da planilha):
 *   • tamanho máximo;
 *   • extensão permitida — com mensagem específica para .xlsm/.xls/.ods;
 *   • assinatura real do conteúdo, compatível com a extensão declarada;
 *   • recusa de binário sem texto (CSV que é na verdade um .xls renomeado);
 *   • inspeção do ZIP (.xlsx): ZIP bomb e macros.
 *
 * O nome do arquivo enviado NUNCA é usado para montar caminho: o servidor
 * grava com um nome próprio (uuid), o que evita path traversal e colisão.
 */
import {
  ALLOWED_IMPORT_EXTENSIONS,
  MAX_IMPORT_FILE_SIZE_BYTES,
  REJECTED_IMPORT_EXTENSIONS,
} from "../dataImport.constants";
import type { ImportFileFormat } from "../dataImport.types";
import { AppError } from "@/shared/errors/AppError";
import { inspectZip, ZipGuardError } from "./zipGuard";

/** Assinatura OLE2 — usada pelo Excel 97-2003 (.xls). */
const OLE2_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** Assinatura ZIP (PK). */
const ZIP_SIGNATURES = [Buffer.from("PK\u0003\u0004", "binary"), Buffer.from("PK\u0005\u0006", "binary"), Buffer.from("PK\u0007\u0008", "binary")];

export interface ValidatedImportFile {
  format: ImportFileFormat;
  extension: string;
  fileName: string;
  fileSize: number;
}

/** Extensão em minúsculas, sem caminho. */
export function extractExtension(fileName: string): string {
  const base = String(fileName || "").split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot).toLowerCase();
}

/**
 * Valida o arquivo e devolve o formato detectado. Lança `AppError` com
 * mensagem adequada para o usuário final.
 */
export function validateImportFile(fileName: string, buffer: Buffer): ValidatedImportFile {
  const extension = extractExtension(fileName);

  if (!extension) {
    throw new AppError("Arquivo sem extensão. Envie um arquivo .xlsx ou .csv.", 400);
  }

  const rejected = REJECTED_IMPORT_EXTENSIONS[extension];
  if (rejected) {
    throw new AppError(rejected, 400);
  }

  if (!(ALLOWED_IMPORT_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new AppError(
      "Formato não suportado. Envie um arquivo .xlsx ou .csv.",
      400,
    );
  }

  if (buffer.length === 0) {
    throw new AppError("O arquivo enviado está vazio.", 400);
  }

  if (buffer.length > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new AppError(
      `O arquivo passa de ${Math.round(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024))} MB. Envie um arquivo menor.`,
      413,
    );
  }

  if (buffer.subarray(0, 8).equals(OLE2_SIGNATURE)) {
    throw new AppError(
      "Este arquivo está no formato .xls (Excel 97-2003). Salve como .xlsx ou .csv e tente de novo.",
      400,
    );
  }

  const isZip = ZIP_SIGNATURES.some((signature) => buffer.subarray(0, 4).equals(signature));

  if (extension === ".xlsx") {
    if (!isZip) {
      throw new AppError(
        "O conteúdo do arquivo não é uma planilha .xlsx válida.",
        400,
      );
    }
    try {
      inspectZip(buffer);
    } catch (err) {
      if (err instanceof ZipGuardError) {
        throw new AppError(err.message, 400);
      }
      throw new AppError("Não foi possível ler a planilha enviada.", 400);
    }
    return {
      format: "XLSX",
      extension,
      fileName: sanitizeFileName(fileName),
      fileSize: buffer.length,
    };
  }

  // .csv — recusa binário disfarçado (planilha em formato antigo renomeada).
  if (isZip || looksBinary(buffer)) {
    throw new AppError(
      "O conteúdo do arquivo não é um CSV de texto. Se for uma planilha, salve como .xlsx.",
      400,
    );
  }

  return {
    format: "CSV",
    extension,
    fileName: sanitizeFileName(fileName),
    fileSize: buffer.length,
  };
}

/** Heurística simples: NUL no começo indica conteúdo binário. */
function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
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
