#!/usr/bin/env node
/**
 * Prepara o traineddata do Tesseract para a importação por imagem.
 *
 * O arquivo NÃO é versionado no repositório (são dezenas de MB por idioma):
 * ele é obtido **na preparação/build**, nunca em runtime. Em runtime o
 * tesseract.js lê `${OCR_TESSDATA_PATH}/${lang}.traineddata` do disco
 * (node_modules/tesseract.js/src/worker-script/index.js:109-114) e, sem o
 * arquivo, tentaria a rede — o que não pode acontecer no servidor. Por isso
 * o upload é recusado antes de gravar qualquer coisa quando falta o
 * traineddata (erro 503 OCR_TRAINEDDATA_MISSING).
 *
 * Uso:
 *   npm run ocr:tessdata                 # baixa eng + por para .tesseract-cache
 *   npm run ocr:tessdata -- --lang=eng   # só um idioma
 *   npm run ocr:tessdata -- --base-url=file:///caminho   # fonte local (CI/offline)
 *   npm run ocr:tessdata -- --cache-dir=/app/.tesseract-cache
 *
 * A fonte padrão é a mesma que o tesseract.js v7 usa por padrão para OCR
 * LSTM-only (node_modules/tesseract.js/src/worker-script/index.js:130):
 * `https://cdn.jsdelivr.net/npm/@tesseract.js-data/<lang>/4.0.0_best_int`.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";

const DEFAULT_BASE_URL = "https://cdn.jsdelivr.net/npm/@tesseract.js-data";
const DEFAULT_LANGS = ["eng", "por"];
/** O traineddata bom tem alguns MB; abaixo disso é página de erro do CDN. */
const TAMANHO_MINIMO = 1_000_000;

function arg(nome, padrao) {
  const achado = process.argv.find((arg) => arg.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : padrao;
}

const cacheDir = resolve(process.cwd(), arg("cache-dir", process.env.OCR_TESSDATA_PATH ?? ".tesseract-cache"));
const baseUrl = arg("base-url", DEFAULT_BASE_URL).replace(/\/$/, "");
const langs = arg("lang", DEFAULT_LANGS.join(",")).split(",").map((lang) => lang.trim()).filter(Boolean);

/** Caminho de origem: URL HTTP(S) ou caminho local (file:// ou diretório). */
function caminhoDeOrigem(lang) {
  const base = baseUrl.startsWith("file://")
    ? baseUrl.replace("file://", "")
    : baseUrl;
  return `${base}/${lang}/4.0.0_best_int/${lang}.traineddata.gz`;
}

async function lerOrigem(lang) {
  const origem = caminhoDeOrigem(lang);
  if (origem.startsWith("http://") || origem.startsWith("https://")) {
    const resposta = await fetch(origem);
    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status} ao baixar ${origem}`);
    }
    return Buffer.from(await resposta.arrayBuffer());
  }
  // Origem local: o arquivo .gz já pronto no disco.
  return readFile(origem);
}

async function prepararIdioma(lang) {
  const destino = resolve(cacheDir, `${lang}.traineddata`);
  if (existsSync(destino)) {
    const stat = await import("node:fs/promises").then((fs) => fs.stat(destino));
    console.log(`[ocr:tessdata] ${lang}: já existe em ${destino} (${stat.size} bytes) — pulando.`);
    return destino;
  }

  const bruto = await lerOrigem(lang);
  // O CDN entrega .gz; o tesseract.js lê o arquivo SEM compressão do cache.
  const dados = bruto[0] === 0x1f && bruto[1] === 0x8b ? gunzipSync(bruto) : bruto;
  if (dados.length < TAMANHO_MINIMO) {
    throw new Error(
      `O traineddata de "${lang}" veio com ${dados.length} bytes — esperado mais de ${TAMANHO_MINIMO}. ` +
        "Provável página de erro do CDN.",
    );
  }

  await writeFile(destino, dados, { mode: 0o644 });
  const sha = createHash("sha256").update(dados).digest("hex").slice(0, 16);
  console.log(`[ocr:tessdata] ${lang}: gravado em ${destino} (${dados.length} bytes, sha256:${sha})`);
  return destino;
}

async function main() {
  await mkdir(cacheDir, { recursive: true });
  console.log(`[ocr:tessdata] cache: ${cacheDir}`);
  console.log(`[ocr:tessdata] origem: ${baseUrl}`);
  for (const lang of langs) {
    await prepararIdioma(lang);
  }
  console.log(`[ocr:tessdata] pronto: ${langs.map((lang) => `${lang}.traineddata`).join(", ")}`);
}

main().catch((err) => {
  console.error(`[ocr:tessdata] FALHOU: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
