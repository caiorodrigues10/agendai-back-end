/**
 * OCR LOCAL das imagens REAIS (spike `spikes/ocr-benchmark`).
 *
 * Roda os DOIS candidatos offline do próprio spike:
 *   - A-tesseract-texto (tesseract.js)  -> src/candidates/a-tesseract-texto.ts
 *   - C-macos-vision (Vision do macOS)    -> src/candidates/c-macos-vision.ts
 *
 * Salva o texto bruto de cada motor em `dataset-real/ocr-output-real/`
 * (pasta IGNORADA pelo Git) e um `<arquivo>.ocr.json` com status, erro e tempo.
 *
 * Sem rede, sem banco, sem API externa. Se um motor não puder rodar (ex.:
 * `tesseract.js` precisa do `eng.traineddata` e o Vision precisa de pyobjc),
 * o erro é gravado no `.ocr.json` — a imagem **não** é abandonada por isso.
 *
 * Uso (a partir de backend/spikes/ocr-benchmark):
 *   ./node_modules/.bin/tsx dataset-real/ocr-local.ts dataset-real/real/x.png
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { tesseractTexto } from "../src/candidates/a-tesseract-texto";
import { macosVision } from "../src/candidates/c-macos-vision";
import { closeTesseractWorker } from "../src/ocr-utils";

const BASE = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(BASE, "ocr-output-real");

async function rodar(motor: { id: string; extract: (p: string) => Promise<any> }, caminho: string) {
  const inicio = Date.now();
  try {
    const extracao = await motor.extract(caminho);
    return {
      motor: motor.id,
      ok: !extracao.error,
      erro: extracao.error ?? null,
      elapsed_ms: Date.now() - inicio,
      linhas: extracao.rows?.length ?? 0,
      raw_text: extracao.rawText ?? "",
    };
  } catch (erro) {
    return {
      motor: motor.id,
      ok: false,
      erro: erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro),
      elapsed_ms: Date.now() - inicio,
      linhas: 0,
      raw_text: "",
    };
  }
}

async function main(): Promise<void> {
  const imagens = process.argv.slice(2);
  if (imagens.length === 0) {
    console.error("uso: tsx dataset-real/ocr-local.ts <imagem> [imagem...]");
    process.exitCode = 1;
    return;
  }
  mkdirSync(SAIDA, { recursive: true });

  for (const imagem of imagens) {
    const nome = basename(imagem).replace(/\.[^.]+$/, "");
    console.log(`=== OCR LOCAL: ${basename(imagem)} ===`);
    const saidas: Record<string, unknown>[] = [];
    for (const motor of [tesseractTexto, macosVision]) {
      const resultado = await rodar(motor, imagem);
      saidas.push(resultado);
      console.log(
        `${resultado.motor}: ${resultado.ok ? "OK" : "FALHOU"} | ${resultado.elapsed_ms} ms | ${resultado.linhas} linha(s)` +
          (resultado.erro ? ` | erro: ${String(resultado.erro).slice(0, 160)}` : ""),
      );
      writeFileSync(
        join(SAIDA, `${nome}.${resultado.motor.toLowerCase()}.txt`),
        resultado.raw_text || `(sem texto)\n`,
        "utf8",
      );
    }
    writeFileSync(
      join(SAIDA, `${nome}.ocr.json`),
      `${JSON.stringify({ imagem: basename(imagem), motores: saidas }, null, 2)}\n`,
      "utf8",
    );
    console.log(`saida em: ${SAIDA}/${nome}.*`);
  }

  await closeTesseractWorker();
}

main();
