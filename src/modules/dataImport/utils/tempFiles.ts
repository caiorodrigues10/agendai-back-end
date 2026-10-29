/**
 * Arquivos temporários da importação.
 *
 * A planilha fica em disco entre as etapas do assistente (o dono pode sair da
 * tela e voltar). O nome do arquivo é um uuid — nunca o nome enviado pelo
 * usuário — e o arquivo é apagado depois do processamento (ou em 7 dias).
 */
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const DIRECTORY_NAME = "agendai-imports";

/** Pasta dos arquivos temporários de importação. */
export function importTempDirectory(): string {
  return join(tmpdir(), DIRECTORY_NAME);
}

/** Grava o arquivo e devolve o caminho absoluto. */
export async function saveTempFile(buffer: Buffer, extension: string): Promise<string> {
  const directory = importTempDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${randomUUID()}${extension}`);
  await writeFile(path, buffer, { mode: 0o600 });
  return path;
}

/** Apaga o arquivo (sem erro se já não existir). */
export async function deleteTempFile(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch {
    // Arquivo já removido — nada a fazer.
  }
}

/**
 * Apaga arquivos temporários antigos. Complementa a remoção por lote: se o
 * processo caiu no meio, o arquivo não fica órfão para sempre.
 */
export async function cleanupOldTempFiles(maxAgeDays = 7): Promise<number> {
  const directory = importTempDirectory();
  let removed = 0;
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return 0;
  }

  const limit = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
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
