/**
 * Detecção do formato do arquivo importado — **por conteúdo**, nunca por
 * extensão nem por mimetype.
 *
 * Por quê: a extensão é escrita pelo dono (ou por quem exportou o sistema
 * antigo) e mente com frequência — `.csv` que é XLSX, `.xlsx` que é CSV, `.xls`
 * que é HTML. A assinatura do arquivo não mente.
 *
 * Reconhecidos:
 *   • ZIP com `xl/workbook.xml`            → XLSX
 *   • ZIP com `xl/workbook.xml` + macro    → XLSM (a macro é ignorada)
 *   • ZIP com `mimetype` do OpenDocument   → ODS
 *   • assinatura OLE2                      → XLS (Excel 97-2003)
 *   • assinatura `%PDF-`                   → PDF
 *   • texto (UTF-8/Latin-1, sem NUL)       → CSV/TSV/TXT (delimitado)
 */
import { AppError } from "@/shared/errors/AppError";

/** Formatos que o importador sabe ler. */
export type DetectedImportFormat = "XLSX" | "XLSM" | "XLS" | "ODS" | "PDF" | "CSV";

/** Assinatura OLE2 — Excel 97-2003 (.xls) e documentos do Office antigos. */
const OLE2_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** Assinaturas de ZIP. */
const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
];

/** Assinatura de PDF. */
const PDF_SIGNATURE = Buffer.from("%PDF-", "ascii");

/** Assinaturas de imagem (Fase 2 vai extrair tabela delas). */
const IMAGE_SIGNATURES: Array<{ bytes: number[]; nome: string }> = [
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], nome: "PNG" },
  { bytes: [0xff, 0xd8, 0xff], nome: "JPEG" },
];

const RIFF = Buffer.from("RIFF", "ascii");
const WEBP = Buffer.from("WEBP", "ascii");

/** O ZIP tem as entradas pedidas? (lê o diretório central, sem descompactar). */
export function zipHasEntries(buffer: Buffer, wanted: string[]): boolean {
  const names = zipEntryNames(buffer);
  return wanted.some((name) => names.includes(name));
}

/**
 * Nomes das entradas do ZIP (diretório central).
 *
 * O mesmo truque do `zipGuard`: o nome do arquivo está no diretório central,
 * que é lido sem descompactar nada.
 */
export function zipEntryNames(buffer: Buffer): string[] {
  const eocdSignature = 0x06054b50;
  let eocd = -1;
  const min = Math.max(0, buffer.length - 66_000);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === eocdSignature) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  const totalEntries = buffer.readUInt16LE(eocd + 10);
  const centralDirSize = buffer.readUInt32LE(eocd + 12);
  const centralDirOffset = buffer.readUInt32LE(eocd + 16);
  if (centralDirOffset + centralDirSize > buffer.length) return [];

  const names: string[] = [];
  let cursor = centralDirOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (cursor + 46 > buffer.length) break;
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    names.push(buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8"));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

/** O arquivo parece binário? (NUL nos primeiros 8 KB) */
function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
}

/**
 * Detecta o formato pelo conteúdo.
 *
 * Lança `AppError` (400) com mensagem para o dono quando o conteúdo não é
 * nenhum formato suportado.
 */
export function detectImportFormat(buffer: Buffer): DetectedImportFormat {
  if (!buffer || buffer.length === 0) {
    throw new AppError("O arquivo enviado está vazio.", 400);
  }

  if (buffer.subarray(0, 8).equals(OLE2_SIGNATURE)) {
    return "XLS";
  }

  if (buffer.subarray(0, 5).equals(PDF_SIGNATURE)) {
    return "PDF";
  }

  for (const signature of IMAGE_SIGNATURES) {
    if (Buffer.from(signature.bytes).equals(buffer.subarray(0, signature.bytes.length))) {
      throw new AppError(
        "Envio de imagem ainda não está disponível. Envie uma planilha (.xlsx, .xls, .ods, .csv) ou um PDF com texto.",
        400,
      );
    }
  }
  if (
    buffer.subarray(0, 4).equals(RIFF) &&
    buffer.subarray(8, 12).equals(WEBP)
  ) {
    throw new AppError(
      "Envio de imagem ainda não está disponível. Envie uma planilha (.xlsx, .xls, .ods, .csv) ou um PDF com texto.",
      400,
    );
  }

  if (ZIP_SIGNATURES.some((signature) => buffer.subarray(0, 4).equals(signature))) {
    const entries = zipEntryNames(buffer);
    if (entries.includes("xl/workbook.xml")) {
      return entries.includes("xl/vbaProject.bin") ? "XLSM" : "XLSX";
    }
    if (entries.includes("content.xml") && entries.includes("mimetype")) {
      return "ODS";
    }
    if (entries.includes("content.xml")) {
      return "ODS";
    }
    throw new AppError(
      "O arquivo é um ZIP, mas não é uma planilha (.xlsx, .xlsm ou .ods).",
      400,
    );
  }

  if (looksBinary(buffer)) {
    throw new AppError(
      "O arquivo enviado não é um texto de planilha nem um PDF legível. Envie .xlsx, .xls, .xlsm, .ods, .csv, .tsv, .txt ou PDF.",
      400,
    );
  }
  return "CSV";
}
