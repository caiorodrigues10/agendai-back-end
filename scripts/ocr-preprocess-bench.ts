#!/usr/bin/env tsx
/**
 * Benchmark do pré-processamento do OCR (Tesseract **real**).
 *
 * Mede, para cada degradação sintética:
 *   • acerto exato, acerto normalizado, falso confiante e confiança média,
 *     por campo (telefone, valor, nome) e no total;
 *   • o custo (tempo de pré-processamento e de OCR) por imagem.
 *
 * O dataset é gerado em memória a partir das imagens sintéticas — nenhuma
 * foto real é lida, nada é versionado. O resultado de cada configuração
 * fica num cache em `os.tmpdir()` para as tabelas serem montadas em
 * execuções separadas.
 *
 * Uso:
 *   npx tsx scripts/ocr-preprocess-bench.ts --config=linha-de-base
 *   npx tsx scripts/ocr-preprocess-bench.ts --config=step:grayscale
 *   npx tsx scripts/ocr-preprocess-bench.ts --config=final
 *   npx tsx scripts/ocr-preprocess-bench.ts --tabelas
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gerarDatasetDegradado, groundTruthDoDataset } from "../src/modules/dataImport/ocr/ocrDegradacoes";
import { extrairImagem } from "../src/modules/dataImport/ocr/ocrExtractor";
import {
  preprocessOcrImage,
  PREPROCESS_STEPS,
  type NomeEtapaPreprocess,
  type PreprocessSteps,
} from "../src/modules/dataImport/ocr/ocrPreprocess";
import {
  avaliarImagem,
  consolidar,
  type MetricaCampo,
  type MetricaConfig,
  type MetricaImagem,
} from "../src/modules/dataImport/ocr/ocrMetricas";
import type { CampoSintetico } from "../src/modules/dataImport/ocr/ocrImagensSinteticas";
import { shutdownOcrWorker } from "../src/modules/dataImport/ocr/ocrWorker";

const CACHE_DIR = join(tmpdir(), "agendai-ocr-bench");

/** Todas as etapas desligadas (linha de base: OCR sem pré-processamento). */
const SEM_PREPROCESS: PreprocessSteps = {
  exifRotate: false,
  grayscale: false,
  normalise: false,
  clahe: false,
  median: false,
  scaleToFloor: false,
  deskew: false,
};

/** Só uma etapa ligada (abordagem: cada etapa sozinha). */
function somenteEtapa(etapa: NomeEtapaPreprocess): PreprocessSteps {
  return {
    ...SEM_PREPROCESS,
    [etapa]: true,
  } as PreprocessSteps;
}

/**
 * Configuração final: só as etapas que a ablação adotou (melhoraram o
 * acerto sem aumentar o falso confiante).
 *
 * `scaleToFloor` ficou de fora: no alvo de 693 px não mudou nada (numa
 * imagem sintética limpa a leitura no piso continua perfeita) e no alvo
 * de 924 px ganhou acerto mas **aumentou o falso confiante** (3 → 10).
 */
const ETAPAS_FINAIS: NomeEtapaPreprocess[] = ["exifRotate", "deskew"];

function configFinal(): PreprocessSteps {
  const steps = { ...SEM_PREPROCESS };
  for (const etapa of ETAPAS_FINAIS) steps[etapa] = true;
  return steps;
}

interface ConfigBenchmark {
  nome: string;
  steps: PreprocessSteps;
  /** Régua alvo da etapa de piso (px). */
  larguraTabelaAlvoPx?: number;
}

/** Configuração a partir do nome pedido na linha de comando. */
function resolverConfig(nome: string): ConfigBenchmark {
  if (nome === "linha-de-base") {
    return { nome: "linha de base (sem pré-processamento)", steps: SEM_PREPROCESS };
  }
  if (nome === "final") {
    return { nome: "final (etapas adotadas)", steps: configFinal() };
  }
  if (nome.startsWith("step:")) {
    const resto = nome.slice("step:".length);
    const [etapa, alvo] = resto.split(":");
    return {
      nome: `step:${etapa}${alvo ? `:${alvo}` : ""}`,
      steps: somenteEtapa(etapa as NomeEtapaPreprocess),
      ...(alvo ? { larguraTabelaAlvoPx: Number(alvo) } : {}),
    };
  }
  if (nome.startsWith("todas:")) {
    const etapas = nome
      .slice("todas:".length)
      .split(",")
      .filter(Boolean) as NomeEtapaPreprocess[];
    const steps = { ...SEM_PREPROCESS };
    for (const etapa of etapas) steps[etapa] = true;
    return { nome: `todas:${etapas.join("+")}`, steps };
  }
  throw new Error(`Configuração desconhecida: ${nome}`);
}

interface ImagemSerializada {
  id: string;
  base: string;
  variante: string;
  campos: Array<{ campo: CampoSintetico } & Omit<MetricaCampo, "campo">>;
  linhasNaoLidas: number;
}

interface ResultadoSerializado {
  nome: string;
  imagens: ImagemSerializada[];
  tempoPreprocessMs: number;
  tempoOcrMs: number;
}

function serializar(config: MetricaConfig, tempoPre: number, tempoOcr: number): ResultadoSerializado {
  return {
    nome: config.nome,
    tempoPreprocessMs: tempoPre,
    tempoOcrMs: tempoOcr,
    imagens: config.imagens.map((imagem) => ({
      id: imagem.id,
      base: imagem.base,
      variante: imagem.variante,
      linhasNaoLidas: imagem.linhasNaoLidas,
      campos: [...imagem.campos.values()].map((campo) => ({
        campo: campo.campo,
        total: campo.total,
        acertoExato: campo.acertoExato,
        acertoNormalizado: campo.acertoNormalizado,
        falsoConfiante: campo.falsoConfiante,
        erroComum: campo.erroComum,
        somaConfianca: campo.somaConfianca,
      })),
    })),
  };
}

function desserializar(dados: ResultadoSerializado): {
  config: MetricaConfig;
  tempoPreprocessMs: number;
  tempoOcrMs: number;
} {
  const imagens: MetricaImagem[] = dados.imagens.map((imagem) => {
    const campos = new Map<CampoSintetico, MetricaCampo>();
    for (const campo of imagem.campos) {
      campos.set(campo.campo, { ...campo });
    }
    return {
      id: imagem.id,
      base: imagem.base,
      variante: imagem.variante,
      campos,
      linhasNaoLidas: imagem.linhasNaoLidas,
    };
  });
  return {
    config: consolidar(dados.nome, imagens),
    tempoPreprocessMs: dados.tempoPreprocessMs,
    tempoOcrMs: dados.tempoOcrMs,
  };
}

function caminhoCache(nome: string): string {
  return join(CACHE_DIR, `${nome.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
}

async function carregarCache(nome: string): Promise<ResultadoSerializado | null> {
  try {
    const bruto = await readFile(caminhoCache(nome), "utf8");
    return JSON.parse(bruto) as ResultadoSerializado;
  } catch {
    return null;
  }
}

async function gravarCache(nome: string, dados: ResultadoSerializado): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(caminhoCache(nome), JSON.stringify(dados, null, 2), "utf8");
}

/** Roda uma configuração: pré-processa, lê com o Tesseract e mede. */
async function rodarConfig(
  benchmark: ConfigBenchmark,
): Promise<{
  config: MetricaConfig;
  tempoPreprocessMs: number;
  tempoOcrMs: number;
}> {
  const dataset = await gerarDatasetDegradado();
  const groundTruth = groundTruthDoDataset();
  const imagens: MetricaImagem[] = [];
  let tempoPreprocessMs = 0;
  let tempoOcrMs = 0;

  for (const imagem of dataset) {
    const inicioPre = Date.now();
    const buffer = await preprocessOcrImage(imagem.buffer, {
      steps: benchmark.steps,
      ...(benchmark.larguraTabelaAlvoPx
        ? { larguraTabelaAlvoPx: benchmark.larguraTabelaAlvoPx }
        : {}),
    });
    tempoPreprocessMs += Date.now() - inicioPre;

    const inicioOcr = Date.now();
    const resultado = await extrairImagem(buffer, imagem.id, imagem.larguraPx);
    tempoOcrMs += Date.now() - inicioOcr;

    const gt = groundTruth.get(imagem.base);
    if (!gt) throw new Error(`Ground truth ausente para ${imagem.base}`);
    imagens.push(
      avaliarImagem(imagem.id, imagem.base, imagem.variante, resultado, gt),
    );
  }

  return {
    config: consolidar(benchmark.nome, imagens),
    tempoPreprocessMs,
    tempoOcrMs,
  };
}

function formatarNumero(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1);
}

function tabelaLinha(celulas: string[]): string {
  return `| ${celulas.join(" | ")} |`;
}

function tabela(cabecalhos: string[], linhas: string[][]): string {
  const separador = `| ${cabecalhos.map(() => "---").join(" | ")} |`;
  return [
    tabelaLinha(cabecalhos),
    separador,
    ...linhas.map((linha) => tabelaLinha(linha)),
  ].join("\n");
}

/** Tabela por campo de uma configuração. */
function tabelaPorCampo(config: MetricaConfig): string {
  const linhas: string[][] = [];
  for (const metrica of config.campos.values()) {
    linhas.push([
      metrica.campo,
      String(metrica.total),
      String(metrica.acertoExato),
      String(metrica.acertoNormalizado),
      String(metrica.falsoConfiante),
      String(metrica.erroComum),
      metrica.total > 0
        ? (metrica.somaConfianca / metrica.total).toFixed(1)
        : "0.0",
    ]);
  }
  linhas.push([
    "**total**",
    String(config.total),
    String(config.acertoExato),
    String(config.acertoNormalizado),
    String(config.falsoConfiante),
    String(config.erroComum),
    config.confiancaMedia.toFixed(1),
  ]);
  return tabela(
    ["campo", "células", "acerto exato", "acerto normalizado", "falso confiante", "erro comum", "confiança média"],
    linhas,
  );
}

/** Tabela por variante (agregando os 3 campos). */
function tabelaPorVariante(config: MetricaConfig): string {
  const porVariante = new Map<
    string,
    { total: number; exato: number; normalizado: number; falso: number; erro: number; confianca: number }
  >();
  for (const imagem of config.imagens) {
    const atual = porVariante.get(imagem.variante) ?? {
      total: 0,
      exato: 0,
      normalizado: 0,
      falso: 0,
      erro: 0,
      confianca: 0,
    };
    for (const metrica of imagem.campos.values()) {
      atual.total += metrica.total;
      atual.exato += metrica.acertoExato;
      atual.normalizado += metrica.acertoNormalizado;
      atual.falso += metrica.falsoConfiante;
      atual.erro += metrica.erroComum;
      atual.confianca += metrica.somaConfianca;
    }
    porVariante.set(imagem.variante, atual);
  }

  const linhas = [...porVariante.entries()].map(([variante, dados]) => [
    variante,
    String(dados.total),
    String(dados.exato),
    String(dados.normalizado),
    String(dados.falso),
    String(dados.erro),
    dados.total > 0 ? (dados.confianca / dados.total).toFixed(1) : "0.0",
  ]);

  return tabela(
    ["variante", "células", "acerto exato", "acerto normalizado", "falso confiante", "erro comum", "confiança média"],
    linhas,
  );
}

/** Tabela comparativa: duas configs lado a lado, por variante. */
function tabelaComparativa(
  base: MetricaConfig,
  nova: MetricaConfig,
): string {
  const porVariante = (config: MetricaConfig) => {
    const mapa = new Map<
      string,
      { total: number; exato: number; falso: number; confianca: number }
    >();
    for (const imagem of config.imagens) {
      const atual = mapa.get(imagem.variante) ?? { total: 0, exato: 0, falso: 0, confianca: 0 };
      for (const metrica of imagem.campos.values()) {
        atual.total += metrica.total;
        atual.exato += metrica.acertoExato;
        atual.falso += metrica.falsoConfiante;
        atual.confianca += metrica.somaConfianca;
      }
      mapa.set(imagem.variante, atual);
    }
    return mapa;
  };

  const mapaBase = porVariante(base);
  const mapaNova = porVariante(nova);

  const linhas = [...mapaNova.keys()].map((variante) => {
    const b = mapaBase.get(variante)!;
    const n = mapaNova.get(variante)!;
    return [
      variante,
      String(n.total),
      `${b.exato} → ${n.exato}`,
      `${b.falso} → ${n.falso}`,
      b.total > 0 ? (b.confianca / b.total).toFixed(1) : "0.0",
      n.total > 0 ? (n.confianca / n.total).toFixed(1) : "0.0",
    ];
  });

  linhas.push([
    "**total**",
    String(nova.total),
    `${base.acertoExato} → ${nova.acertoExato}`,
    `${base.falsoConfiante} → ${nova.falsoConfiante}`,
    base.confiancaMedia.toFixed(1),
    nova.confiancaMedia.toFixed(1),
  ]);

  return tabela(
    [
      "variante",
      "células",
      "acerto exato (base → pré)",
      "falso confiante (base → pré)",
      "confiança média base",
      "confiança média pré",
    ],
    linhas,
  );
}

/** Tabela de decisão: cada etapa sozinha contra a linha de base. */
async function imprimirAblacao(): Promise<void> {
  const baseBruto = await carregarCache("linha-de-base");
  if (!baseBruto) throw new Error("Sem cache da linha de base");
  const base = desserializar(baseBruto).config;

  const etapas: NomeEtapaPreprocess[] = [
    "exifRotate",
    "grayscale",
    "normalise",
    "clahe",
    "median",
    "scaleToFloor",
    "deskew",
  ];

  const linhas: string[][] = [];
  for (const etapa of etapas) {
    const bruto = await carregarCache(`step:${etapa}`);
    if (!bruto) {
      linhas.push([etapa, "—", "—", "—", "—", "—", "sem cache"]);
      continue;
    }
    const config = desserializar(bruto).config;
    const melhoraAcerto = config.acertoExato - base.acertoExato;
    const mexeuFalsoConfiante = config.falsoConfiante - base.falsoConfiante;
    const decisão =
      melhoraAcerto > 0 && mexeuFalsoConfiante <= 0
        ? "ADOTAR"
        : "descartar";
    linhas.push([
      etapa,
      String(base.acertoExato),
      String(config.acertoExato),
      `${melhoraAcerto > 0 ? "+" : ""}${melhoraAcerto}`,
      String(base.falsoConfiante),
      String(config.falsoConfiante),
      decisão,
    ]);
  }

  console.log("## Ablação — cada etapa sozinha contra a linha de base");
  console.log("");
  console.log(
    tabela(
      [
        "etapa",
        "acerto base",
        "acerto com a etapa",
        "delta acerto",
        "falso conf. base",
        "falso conf. com a etapa",
        "decisão",
      ],
      linhas,
    ),
  );
}

async function main(): Promise<void> {
  const argumentos = process.argv.slice(2);
  const pedido = argumentos.find((a) => a.startsWith("--config="));
  const soTabelas = argumentos.includes("--tabelas");
  const soAblacao = argumentos.includes("--ablacao");

  if (soAblacao) {
    await imprimirAblacao();
    return;
  }

  if (soTabelas) {
    await imprimirTabelasDoCache();
    return;
  }

  if (!pedido) {
    throw new Error(
      "Informe --config=linha-de-base | --config=step:<etapa> | --config=final | --tabelas",
    );
  }

  const nomePedido = pedido.slice("--config=".length);
  const cache = await carregarCache(nomePedido);
  if (cache) {
    const { config } = desserializar(cache);
    console.log(`[ocr:bench] ${nomePedido}: cache carregado (${config.total} células)`);
    return;
  }

  const benchmark = resolverConfig(nomePedido);
  console.log(
    `[ocr:bench] rodando "${benchmark.nome}" (${Object.entries(benchmark.steps)
      .filter(([, ligado]) => ligado)
      .map(([etapa]) => etapa)
      .join(", ") || "nenhuma etapa"})`,
  );

  const inicio = Date.now();
  const { config, tempoPreprocessMs, tempoOcrMs } = await rodarConfig(benchmark);
  console.log(
    `[ocr:bench] pronto em ${((Date.now() - inicio) / 1000).toFixed(1)}s (pré ${tempoPreprocessMs}ms, OCR ${tempoOcrMs}ms)`,
  );
  console.log("");
  console.log(`### ${config.nome}`);
  console.log("");
  console.log(tabelaPorCampo(config));
  console.log("");
  console.log(tabelaPorVariante(config));

  await gravarCache(nomePedido, serializar(config, tempoPreprocessMs, tempoOcrMs));
  await shutdownOcrWorker();
}

/** Imprime as tabelas comparativas usando o cache. */
async function imprimirTabelasDoCache(): Promise<void> {
  const base = await carregarCache("linha-de-base");
  if (!base) throw new Error("Sem cache da linha de base: rode --config=linha-de-base");
  const baseConfig = desserializar(base).config;

  console.log("## Linha de base — por campo");
  console.log("");
  console.log(tabelaPorCampo(baseConfig));
  console.log("");
  console.log("## Linha de base — por variante");
  console.log("");
  console.log(tabelaPorVariante(baseConfig));
  console.log("");

  const passo = process.argv.find((a) => a.startsWith("--final="));
  if (passo) {
    const nomeFinal = passo.slice("--final=".length);
    const final = await carregarCache(nomeFinal);
    if (!final) throw new Error(`Sem cache de ${nomeFinal}`);
    const finalConfig = desserializar(final).config;
    console.log(`## Comparação — linha de base → ${nomeFinal}`);
    console.log("");
    console.log(tabelaComparativa(baseConfig, finalConfig));
    console.log("");
    console.log(`### ${finalConfig.nome} — por campo`);
    console.log("");
    console.log(tabelaPorCampo(finalConfig));
  }
}

main().catch((erro) => {
  console.error(`[ocr:bench] FALHOU: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exit(1);
});
