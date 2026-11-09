/**
 * Runner do spike: percorre o dataset, roda cada candidato em cada imagem
 * e grava o relatório bruto em `resultados/resultados.json`.
 *
 * Uso:
 *   npx tsx src/run.ts                     # todos os candidatos
 *   npx tsx src/run.ts llm                 # filtra por trecho do id
 *
 * Variáveis de ambiente:
 *   REPEAT=3        execuções por imagem (candidatos não determinísticos)
 *   CONCURRENCY=4   chamadas simultâneas dentro de um candidato
 *   LIMIT=6         limita a quantidade de imagens (teste rápido)
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateCandidate, type GroundTruthRow } from "./evaluate";
import { closeTesseractWorker } from "./ocr-utils";
import type { Candidate, ExtractionResult } from "./types";
import { tesseractTexto } from "./candidates/a-tesseract-texto";
import { tesseractLayout } from "./candidates/b-tesseract-layout";
import { macosVision } from "./candidates/c-macos-vision";
import { paddleOcr } from "./candidates/g-paddleocr";
import { llmVisao } from "./candidates/d-llm-visao";
import { ocrMaisLlm } from "./candidates/e-ocr-mais-llm";
import { llmVisaoComGate } from "./candidates/f-llm-visao-gate";

const ROOT = path.resolve(__dirname, "..");
const DATASET = path.join(ROOT, "dataset");
const IMAGES = path.join(DATASET, "images");
const OUT = path.join(ROOT, "resultados");
const CACHE = path.join(OUT, "cache");

interface TruthFile {
  casos: Array<{ id: string; degradation: string; rows: GroundTruthRow[] }>;
}

type Amostra = { rows: ExtractionResult["rows"]; elapsedMs: number; error?: string; attempts?: number };

const TODOS: Candidate[] = [
  tesseractTexto,
  tesseractLayout,
  macosVision,
  paddleOcr,
  llmVisao,
  ocrMaisLlm,
  llmVisaoComGate,
];

/** Executa `fn` sobre `itens` com no máximo `limite` tarefas simultâneas. */
async function comConcorrencia<T, R>(
  itens: T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>
): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;

  async function operario(): Promise<void> {
    for (;;) {
      const indice = proximo++;
      if (indice >= itens.length) return;
      resultados[indice] = await fn(itens[indice], indice);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, () => operario()));
  return resultados;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });

  const truth = JSON.parse(fs.readFileSync(path.join(DATASET, "ground-truth.json"), "utf8")) as TruthFile;

  const limite = Number(process.env.LIMIT ?? 0);
  const repeat = Math.max(1, Number(process.env.REPEAT ?? 1));
  const concorrencia = Math.max(1, Number(process.env.CONCURRENCY ?? 1));
  const pular = (process.env.SKIP_DEGRADATIONS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  const base = truth.casos.filter((c) => !pular.includes(c.degradation));
  const casos = limite > 0 ? base.slice(0, limite) : base;
  if (process.env.RESET_CACHE === "1") fs.rmSync(CACHE, { recursive: true, force: true });

  const filtro = process.argv.slice(2);
  const candidatos = filtro.length
    ? TODOS.filter((c) => filtro.some((f) => c.id.toLowerCase().includes(f.toLowerCase())))
    : TODOS;

  if (candidatos.length === 0) {
    console.error("Nenhum candidato selecionado.");
    process.exit(1);
  }

  console.log(
    `${casos.length} imagens × ${repeat} execução(ões) · concorrência ${concorrencia} · ` +
      `candidatos: ${candidatos.map((c) => c.id).join(", ")}`
  );

  const relatorios = [];

  for (const candidato of candidatos) {
    console.log(`\n=== ${candidato.id} (${candidato.label}) ===`);
    const amostras = new Map<string, Amostra[]>();

    await comConcorrencia(casos, concorrencia, async (caso) => {
      const imagePath = path.join(IMAGES, `${caso.id}.jpg`);
      const lista: Amostra[] = [];

      if (!fs.existsSync(imagePath)) {
        lista.push({ rows: [], elapsedMs: 0, error: "imagem ausente" });
      } else {
        for (let rep = 0; rep < repeat; rep++) {
          // Cache em disco: uma execução interrompida continua de onde parou
          // (o provedor é lento e falha sob concorrência). Só sucesso é cacheado.
          const arquivoCache = path.join(
            CACHE,
            candidato.id,
            `${caso.id}-r${rep}.json`
          );
          if (fs.existsSync(arquivoCache)) {
            lista.push(JSON.parse(fs.readFileSync(arquivoCache, "utf8")) as Amostra);
            continue;
          }

          // Falha de infraestrutura (provedor vazio, timeout) é retentada:
          // em produção o mesmo retry existiria, e medir a falha bruta do
          // provedor não diz nada sobre a qualidade da extração.
          let amostra: Amostra = { rows: [], elapsedMs: 0, error: "não executado" };
          for (let tentativa = 1; tentativa <= 2; tentativa++) {
            const inicio = Date.now();
            try {
              const r = await candidato.extract(imagePath);
              amostra = { rows: r.rows, elapsedMs: r.elapsedMs, error: r.error, attempts: r.attempts };
            } catch (err) {
              amostra = {
                rows: [],
                elapsedMs: Date.now() - inicio,
                error: err instanceof Error ? err.message : String(err),
              };
            }
            if (!amostra.error) break;
            await new Promise((resolve) => setTimeout(resolve, 800 * tentativa));
          }
          if (!amostra.error) {
            fs.mkdirSync(path.dirname(arquivoCache), { recursive: true });
            fs.writeFileSync(arquivoCache, JSON.stringify(amostra));
          }
          lista.push(amostra);
        }
      }

      amostras.set(caso.id, lista);
      const status = lista.map((a) => (a.error ? `ERRO(${a.error.slice(0, 40)})` : `${a.rows.length} linhas`)).join(" | ");
      console.log(`  ${caso.id}: ${status}`);
    });

    const relatorio = evaluateCandidate(candidato, casos, amostras);
    relatorios.push(relatorio);
    const t = relatorio.totais;
    console.log(
      `  → telefone: ${t.telefone.corretas}/${t.telefone.total} corretas, ` +
        `${t.telefone.falsoConfiante} falso confiante | ` +
        `valor: ${t.valor.corretas}/${t.valor.total} corretas, ` +
        `${t.valor.falsoConfiante} falso confiante | ` +
        `nome: ${t.nome.corretas}/${t.nome.total}`
    );
  }

  const nomeArquivo = filtro.length ? `resultados-${filtro.join("-")}.json` : "resultados.json";
  fs.writeFileSync(
    path.join(OUT, nomeArquivo),
    JSON.stringify(
      {
        executadoEm: new Date().toISOString(),
        imagens: casos.length,
        repeticoes: repeat,
        concorrencia,
        degradacoesPuladas: pular,
        candidatos: relatorios,
      },
      null,
      2
    )
  );
  console.log(`\nResultado em ${path.join(OUT, nomeArquivo)}`);
}

main()
  .then(async () => {
    await closeTesseractWorker();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await closeTesseractWorker().catch(() => undefined);
    process.exit(1);
  });
