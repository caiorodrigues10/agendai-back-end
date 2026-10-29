/**
 * Guarda do container ZIP usada pelos arquivos .xlsx.
 *
 * O .xlsx é um ZIP. Um ZIP pode descompactar 10 MB em gigabytes (ZIP bomb) e
 * estourar a memória do processo. Este módulo lê o diretório central do ZIP
 * — que declara o tamanho descomprimido de cada entrada — e recusa o arquivo
 * antes que qualquer biblioteca tente descompactá-lo.
 *
 * A leitura é feita à mão de propósito: sem dependência extra e sem
 * descompactar nada.
 */
import {
  MAX_XLSX_ENTRIES,
  MAX_XLSX_UNCOMPRESSED_BYTES,
} from "../dataImport.constants";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const ZIP64_MARKER = 0xffffffff;

/** Tamanho fixo do registro EOCD (sem o comentário). */
const EOCD_MIN_SIZE = 22;

/** Entradas que indicam macro (Excel com código) — nunca são aceitas. */
const MACRO_ENTRY_MARKERS = ["vbaproject.bin", "vbaProject.bin"];

export class ZipGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipGuardError";
  }
}

export interface ZipGuardResult {
  entryCount: number;
  uncompressedBytes: number;
  entryNames: string[];
}

/**
 * Lê o diretório central e devolve a soma dos tamanhos descomprimidos.
 * Lança `ZipGuardError` quando o arquivo não é um ZIP legível ou quando os
 * limites estouram.
 */
export function inspectZip(buffer: Buffer): ZipGuardResult {
  if (buffer.length < EOCD_MIN_SIZE) {
    throw new ZipGuardError("Arquivo muito curto para ser uma planilha válida.");
  }

  const eocdOffset = findEocdOffset(buffer);
  if (eocdOffset < 0) {
    throw new ZipGuardError("Estrutura do arquivo .xlsx inválida.");
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (totalEntries > MAX_XLSX_ENTRIES) {
    throw new ZipGuardError(
      `O arquivo tem ${totalEntries} entradas internas; o limite é ${MAX_XLSX_ENTRIES}.`,
    );
  }
  if (centralDirOffset === ZIP64_MARKER || centralDirSize === ZIP64_MARKER) {
    throw new ZipGuardError("Arquivo .xlsx em formato ZIP64 não suportado.");
  }
  if (centralDirOffset + centralDirSize > buffer.length) {
    throw new ZipGuardError("Estrutura do arquivo .xlsx inválida.");
  }

  let cursor = centralDirOffset;
  let uncompressedBytes = 0;
  const entryNames: string[] = [];

  for (let i = 0; i < totalEntries; i += 1) {
    if (cursor + 46 > buffer.length) {
      throw new ZipGuardError("Estrutura do arquivo .xlsx inválida.");
    }
    if (buffer.readUInt32LE(cursor) !== CENTRAL_HEADER_SIGNATURE) {
      throw new ZipGuardError("Estrutura do arquivo .xlsx inválida.");
    }

    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraFieldLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);

    if (uncompressedSize === ZIP64_MARKER || compressedSize === ZIP64_MARKER) {
      throw new ZipGuardError("Arquivo .xlsx em formato ZIP64 não suportado.");
    }

    const nameStart = cursor + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > buffer.length) {
      throw new ZipGuardError("Estrutura do arquivo .xlsx inválida.");
    }
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");
    entryNames.push(name);

    uncompressedBytes += uncompressedSize;

    if (uncompressedBytes > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new ZipGuardError(
        "O conteúdo compactado do arquivo é grande demais para ser processado com segurança.",
      );
    }

    cursor = nameEnd + extraFieldLength + commentLength;
  }

  // A entrada da macro vem com caminho (`xl/vbaProject.bin`): compara pelo
  // nome do arquivo, não pelo caminho completo.
  const hasMacro = entryNames.some((name) => {
    const base = name.split("/").pop()?.toLowerCase() ?? "";
    return MACRO_ENTRY_MARKERS.includes(base);
  });
  if (hasMacro) {
    throw new ZipGuardError(
      "O arquivo contém macros. Salve a planilha como .xlsx sem macros e tente de novo.",
    );
  }

  return { entryCount: totalEntries, uncompressedBytes, entryNames };
}

/**
 * Procura o registro EOCD de trás para frente. O comentário final do ZIP pode
 * ter até 65535 bytes, então a busca cobre os últimos 64 KB + 22 bytes.
 */
function findEocdOffset(buffer: Buffer): number {
  const maxComment = 0xffff;
  const searchStart = Math.max(0, buffer.length - EOCD_MIN_SIZE - maxComment);
  for (let i = buffer.length - EOCD_MIN_SIZE; i >= searchStart; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  return -1;
}
