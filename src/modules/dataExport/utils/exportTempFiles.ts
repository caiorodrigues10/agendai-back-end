/**
 * Arquivos temporários da exportação.
 *
 * O arquivo gerado fica em disco entre a geração e o download (o dono pode
 * baixar depois). O nome é um uuid — nunca o nome do negócio — e o arquivo é
 * apagado 24h depois de concluído (ou sob demanda).
 */
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const DIRECTORY_NAME = "agendai-exports";

/** Pasta dos arquivos temporários de exportação. */
export function exportTempDirectory(): string {
  return join(tmpdir(), DIRECTORY_NAME);
}

/** Caminho absoluto de um arquivo novo (o arquivo ainda não existe). */
export function newExportFilePath(extension: "xlsx" | "zip"): string {
  return join(exportTempDirectory(), `${randomUUID()}.${extension}`);
}

/** Grava conteúdo em um caminho (modo privado). */
export async function writeExportFile(path: string, content: Buffer): Promise<void> {
  await mkdir(exportTempDirectory(), { recursive: true, mode: 0o700 });
  await writeFile(path, content, { mode: 0o600 });
}

/** Apaga o arquivo (sem erro se já não existir). */
export async function deleteExportFile(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch {
    // Arquivo já removido — nada a fazer.
  }
}

/**
 * Apaga arquivos temporários antigos. Complementa a expiração por job: se o
 * processo caiu no meio, o arquivo não fica órfão para sempre.
 */
export async function cleanupOldExportFiles(maxAgeHours = 24): Promise<number> {
  const directory = exportTempDirectory();
  let removed = 0;
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return 0;
  }

  const limit = Date.now() - maxAgeHours * 60 * 60 * 1000;
  for (const entry of entries) {
    const path = join(directory, entry);
    try {
      const info = await stat(path);
      if (info.mtimeMs < limit) {
        await unlink(path);
        removed += 1;
      }
    } catch {
      // Corrida com outro cleanup — ignora.
    }
  }
  return removed;
}
