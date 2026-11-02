/**
 * Guarda do container OLE2 (Excel 97-2003, `.xls`).
 *
 * O `.xls` é um "compound file" (OLE2): o cabeçalho e o diretório interno
 * **declaram** o tamanho de cada stream. Um arquivo malicioso pode declarar
 * gigabytes num arquivo de poucos KB — quem lê o tamanho declarado e aloca
 * por ele estoura a memória do processo.
 *
 * Esta guarda lê o cabeçalho e o diretório do arquivo **sem decodificar
 * stream nenhum** e recusa o arquivo antes que o leitor de planilha veja ele.
 *
 * Referência do formato: [MS-CFB] Compound File Binary File Format.
 */
import { AppError } from "@/shared/errors/AppError";

/** Assinatura OLE2. */
const OLE2_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** Tamanho do cabeçalho do compound file (512 bytes). */
const HEADER_SIZE = 512;

/** Bytes por entrada do diretório (128 bytes). */
const DIRECTORY_ENTRY_SIZE = 128;

/** Total de bytes que os streams do arquivo podem declarar. */
export const MAX_OLE2_DECLARED_BYTES = 60 * 1024 * 1024;

/** Multiplicador aceito entre o tamanho declarado e o tamanho real. */
const MAX_DECLARED_RATIO = 20;

/** Tolerância em bytes para o cálculo da razão. */
const RATIO_TOLERANCE = 1024 * 1024;

/** Fim de cadeia na FAT. */
const ENDOFCHAIN = 0xfffffffe;

/** Setor livre. */
const FREESECT = 0xffffffff;

/** Número máximo de setores percorridos (proteção contra ciclo na FAT). */
const MAX_SECTORS = 1_000_000;

export interface Ole2Inspection {
  /** Total de bytes declarados pelos streams do arquivo. */
  declaredBytes: number;
  /** Tamanho do setor. */
  sectorSize: number;
  /** Número de setores que o arquivo realmente tem. */
  availableSectors: number;
}

/**
 * Lê o cabeçalho e o diretório do compound file.
 *
 * Lança `AppError` (400) quando o arquivo declara mais do que tem.
 */
export function inspectOle2(buffer: Buffer): Ole2Inspection {
  if (!buffer.subarray(0, 8).equals(OLE2_SIGNATURE)) {
    throw new AppError("O arquivo enviado não é um .xls (Excel 97-2003) válido.", 400);
  }
  if (buffer.length < HEADER_SIZE) {
    throw new AppError("O arquivo .xls enviado está truncado.", 400);
  }

  const sectorShift = buffer.readUInt16LE(30);
  const sectorSize = 1 << sectorShift;
  if (sectorSize < 128 || sectorSize > 65536) {
    throw new AppError("Estrutura do arquivo .xls inválida.", 400);
  }

  const fatSectorCount = buffer.readUInt32LE(44);
  const firstDirectorySector = buffer.readUInt32LE(48);
  const difatSectorCount = buffer.readUInt32LE(72);

  const availableSectors = Math.max(0, Math.floor((buffer.length - HEADER_SIZE) / sectorSize));

  // O arquivo declara mais setores do que tem: o tamanho é falso.
  if (fatSectorCount > availableSectors) {
    throw new AppError(
      "O arquivo .xls declara um tamanho maior do que o arquivo tem. Não foi possível lê-lo com segurança.",
      400,
    );
  }
  if (difatSectorCount > availableSectors) {
    throw new AppError(
      "O arquivo .xls declara um tamanho maior do que o arquivo tem. Não foi possível lê-lo com segurança.",
      400,
    );
  }

  const fatSectors = readDifat(buffer, sectorSize, fatSectorCount);
  if (fatSectors.length < fatSectorCount) {
    throw new AppError(
      "O arquivo .xls declara uma tabela de alocação maior do que o arquivo tem.",
      400,
    );
  }

  const fat = readFat(buffer, sectorSize, fatSectors);
  const declaredBytes = sumDeclaredStreams(buffer, fat, sectorSize, firstDirectorySector);

  if (declaredBytes > MAX_OLE2_DECLARED_BYTES) {
    throw new AppError(
      "O conteúdo do arquivo .xls é grande demais para ser processado com segurança.",
      400,
    );
  }
  if (declaredBytes > buffer.length * MAX_DECLARED_RATIO + RATIO_TOLERANCE) {
    throw new AppError(
      "O arquivo .xls declara um tamanho maior do que o arquivo tem. Não foi possível lê-lo com segurança.",
      400,
    );
  }

  return { declaredBytes, sectorSize, availableSectors };
}

/** Setores da FAT: 109 no cabeçalho + os setores DIFAT. */
function readDifat(buffer: Buffer, sectorSize: number, fatSectorCount: number): number[] {
  const sectors: number[] = [];
  for (let i = 0; i < 109 && sectors.length < fatSectorCount; i += 1) {
    const sector = buffer.readUInt32LE(76 + i * 4);
    if (sector === FREESECT || sector === ENDOFCHAIN) break;
    sectors.push(sector);
  }

  let difatSector = buffer.readUInt32LE(68);
  let guard = 0;
  while (difatSector !== FREESECT && difatSector !== ENDOFCHAIN && sectors.length < fatSectorCount) {
    if (guard++ > MAX_SECTORS) break;
    const start = HEADER_SIZE + difatSector * sectorSize;
    if (start + sectorSize > buffer.length) break;
    const entriesPerSector = sectorSize / 4 - 1;
    for (let i = 0; i < entriesPerSector && sectors.length < fatSectorCount; i += 1) {
      const sector = buffer.readUInt32LE(start + i * 4);
      if (sector === FREESECT || sector === ENDOFCHAIN) break;
      sectors.push(sector);
    }
    difatSector = buffer.readUInt32LE(start + sectorSize - 4);
  }

  return sectors;
}

/** A FAT inteira (entradas de 4 bytes por setor). */
function readFat(buffer: Buffer, sectorSize: number, fatSectors: number[]): Uint32Array {
  const entriesPerSector = sectorSize / 4;
  const fat = new Uint32Array(fatSectors.length * entriesPerSector);
  let cursor = 0;
  for (const sector of fatSectors) {
    const start = HEADER_SIZE + sector * sectorSize;
    if (start + sectorSize > buffer.length) break;
    for (let i = 0; i < entriesPerSector; i += 1) {
      fat[cursor] = buffer.readUInt32LE(start + i * 4);
      cursor += 1;
    }
  }
  return fat;
}

/** Soma dos tamanhos declarados dos streams do diretório. */
function sumDeclaredStreams(
  buffer: Buffer,
  fat: Uint32Array,
  sectorSize: number,
  firstDirectorySector: number,
): number {
  const entriesPerSector = sectorSize / DIRECTORY_ENTRY_SIZE;
  let sector = firstDirectorySector;
  let declared = 0;
  let guard = 0;

  while (sector !== FREESECT && sector !== ENDOFCHAIN) {
    if (guard++ > MAX_SECTORS) break;
    if (sector >= fat.length) break;

    const start = HEADER_SIZE + sector * sectorSize;
    if (start + sectorSize > buffer.length) break;

    for (let i = 0; i < entriesPerSector; i += 1) {
      const base = start + i * DIRECTORY_ENTRY_SIZE;
      if (base + DIRECTORY_ENTRY_SIZE > buffer.length) break;

      const type = buffer[base + 66];
      if (type !== 2) continue; // só streams (1 = storage, 5 = root)

      const low = buffer.readUInt32LE(base + 120);
      const high = buffer.readUInt32LE(base + 124);
      declared += high * 0x100000000 + low;
      if (declared > MAX_OLE2_DECLARED_BYTES) return declared;
    }

    sector = fat[sector];
  }

  return declared;
}
