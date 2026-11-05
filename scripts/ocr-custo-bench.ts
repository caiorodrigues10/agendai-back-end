#!/usr/bin/env tsx
/**
 * Custo do OCR de importação: tempo por imagem e RAM de pico.
 *
 * Roda o caminho de produção (valida → prepara → [pré-processa] → lê com o
 * Tesseract → apaga o temporário) e depois **espera o idle de 60 s** do
 * worker, para medir também o custo de manter (e de encerrar) o worker.
 *
 * Uso (o RAM de pico vem do `/usr/bin/time -l` de fora):
 *   /usr/bin/time -l npx tsx scripts/ocr-custo-bench.ts --modo=sem-preprocess
 *   /usr/bin/time -l npx tsx scripts/ocr-custo-bench.ts --modo=com-preprocess
 */
import { gerarImagensSinteticas } from "../src/modules/dataImport/ocr/ocrImagensSinteticas";
import { validateAndPrepareImage, cleanupImage } from "../src/modules/dataImport/ocr/ocrSecurity";
import { extrairImagem } from "../src/modules/dataImport/ocr/ocrExtractor";
import { preprocessOcrImage, PREPROCESS_STEPS } from "../src/modules/dataImport/ocr/ocrPreprocess";
import { OCR_WORKER_IDLE_MS } from "../src/modules/dataImport/ocr/ocr.constants";
import { shutdownOcrWorker } from "../src/modules/dataImport/ocr/ocrWorker";

async function main(): Promise<void> {
  const modo = process.argv.find((a) => a.startsWith("--modo="))?.slice("--modo=".length);
  if (modo !== "sem-preprocess" && modo !== "com-preprocess") {
    throw new Error("Use --modo=sem-preprocess | --modo=com-preprocess");
  }
  const comPreprocess = modo === "com-preprocess";

  const larguraPedida = Number(
    process.argv.find((a) => a.startsWith("--largura="))?.slice("--largura=".length) || 0,
  );
  const alturaPedida = Number(
    process.argv.find((a) => a.startsWith("--altura="))?.slice("--altura=".length) || 0,
  );

  const sharp = (await import("sharp")).default;
  const imagensBrutas = gerarImagensSinteticas();
  const imagens = await Promise.all(
    imagensBrutas.map(async (imagem) => {
      let buffer = imagem.buffer;
      if (larguraPedida) {
        buffer = await sharp(buffer)
          .resize({ width: larguraPedida, kernel: sharp.kernel.lanczos3 })
          .png()
          .toBuffer();
      }
      if (alturaPedida) {
        const metadata = await sharp(buffer).metadata();
        const margemTopo = Math.round((alturaPedida - (metadata.height ?? 0)) / 2);
        buffer = await sharp(buffer)
          .extend({
            top: Math.max(0, margemTopo),
            bottom: Math.max(0, alturaPedida - (metadata.height ?? 0) - Math.max(0, margemTopo)),
            background: "#ffffff",
          })
          .png()
          .toBuffer();
      }
      return { ...imagem, buffer };
    }),
  );

  let tempoValidacao = 0;
  let tempoPreprocess = 0;
  let tempoOcr = 0;
  let picoRssInterno = 0;

  for (const imagem of imagens) {
    const inicio = Date.now();
    const validada = await validateAndPrepareImage(imagem.nome, imagem.buffer);
    tempoValidacao += Date.now() - inicio;

    try {
      let buffer = validada.ocrPath ? await readFile(validada.ocrPath) : imagem.buffer;

      if (comPreprocess) {
        const inicioPre = Date.now();
        buffer = await preprocessOcrImage(buffer, { steps: PREPROCESS_STEPS });
        tempoPreprocess += Date.now() - inicioPre;
      }

      const inicioOcr = Date.now();
      await extrairImagem(buffer, imagem.nome, validada.width);
      tempoOcr += Date.now() - inicioOcr;

      const memoria = process.memoryUsage();
      if (memoria.rss > picoRssInterno) picoRssInterno = memoria.rss;
    } finally {
      await cleanupImage(validada);
    }
  }

  const total = tempoValidacao + tempoPreprocess + tempoOcr;
  const imagensProcessadas = imagens.length;

  console.log("");
  console.log(
    `[ocr:custo] modo=${modo} imagens=${imagensProcessadas} largura=${larguraPedida || "original"}`,
  );
  console.log(
    `[ocr:custo] validação+temp: ${tempoValidacao}ms (${(tempoValidacao / imagensProcessadas).toFixed(0)}ms/imagem)`,
  );
  console.log(
    `[ocr:custo] pré-processamento: ${tempoPreprocess}ms (${(tempoPreprocess / imagensProcessadas).toFixed(0)}ms/imagem)`,
  );
  console.log(
    `[ocr:custo] OCR (Tesseract real): ${tempoOcr}ms (${(tempoOcr / imagensProcessadas).toFixed(0)}ms/imagem)`,
  );
  console.log(
    `[ocr:custo] total por imagem: ${(total / imagensProcessadas).toFixed(0)}ms/imagem`,
  );
  console.log(
    `[ocr:custo] pico de RSS no processo (Node): ${(picoRssInterno / (1024 * 1024)).toFixed(1)} MB`,
  );

  console.log(
    `[ocr:custo] esperando o idle de ${OCR_WORKER_IDLE_MS}ms para o worker do Tesseract encerrar...`,
  );
  await new Promise((resolve) => setTimeout(resolve, OCR_WORKER_IDLE_MS + 500));
  await shutdownOcrWorker();
  console.log("[ocr:custo] worker encerrado.");
}

async function readFile(caminho: string): Promise<Buffer> {
  const { readFile: ler } = await import("node:fs/promises");
  return ler(caminho);
}

main().catch((erro) => {
  console.error(`[ocr:custo] FALHOU: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exit(1);
});
