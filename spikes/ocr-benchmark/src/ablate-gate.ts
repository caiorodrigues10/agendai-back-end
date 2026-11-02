/**
 * Ablação do gate determinístico: aplica a validação de produção
 * **às mesmas extrações do candidato D** (cache do D), sem chamar o LLM de
 * novo. Assim a comparação "com gate × sem gate" não fica contaminada pela
 * variância do modelo: o único fator que muda é o filtro.
 *
 * Uso: npx tsx src/ablate-gate.ts
 */
import fs from "node:fs";
import path from "node:path";
import { evaluateCandidate, type GroundTruthRow } from "./evaluate";
import { normalizeMoney, normalizePhone } from "../../../src/modules/dataImport/utils/rowNormalization";
import type { ExtractedRow } from "./types";

const ROOT = path.resolve(__dirname, "..");
const CACHE_D = path.join(ROOT, "resultados", "cache", "D-llm-visao");
const SAIDA = path.join(ROOT, "resultados", "resultados-ablation.json");

interface TruthFile {
  casos: Array<{ id: string; degradation: string; rows: GroundTruthRow[] }>;
}

type Amostra = { rows: ExtractedRow[]; elapsedMs: number; error?: string; attempts?: number };

function telefoneValido(value: string | undefined): boolean {
  return Boolean(value) && normalizePhone(value!) !== null;
}

function valorValido(value: string | undefined): boolean {
  return Boolean(value) && normalizeMoney(value!) !== null;
}

function aplicarGate(rows: ExtractedRow[]): ExtractedRow[] {
  return rows.filter(
    (r) => (!r.telefone || telefoneValido(r.telefone)) && (!r.valor || valorValido(r.valor))
  );
}

function main(): void {
  const truth = JSON.parse(
    fs.readFileSync(path.join(ROOT, "dataset", "ground-truth.json"), "utf8")
  ) as TruthFile;

  const casos = truth.casos.filter((caso) => {
    const pasta = path.join(CACHE_D, `${caso.id}-r0.json`);
    return fs.existsSync(pasta);
  });

  const amostras = new Map<string, Amostra[]>();
  for (const caso of casos) {
    const lista: Amostra[] = [];
    for (let rep = 0; rep < 10; rep++) {
      const arquivo = path.join(CACHE_D, `${caso.id}-r${rep}.json`);
      if (!fs.existsSync(arquivo)) continue;
      const original = JSON.parse(fs.readFileSync(arquivo, "utf8")) as Amostra;
      lista.push({ ...original, rows: aplicarGate(original.rows) });
    }
    if (lista.length) amostras.set(caso.id, lista);
  }

  const relatorio = evaluateCandidate(
    {
      id: "F*-gate-ablation",
      label: "Gate aplicado às mesmas extrações do D",
      description:
        "Ablação: as extrações do D passam pelo gate de produção (abdica da linha com célula inválida). Mesmas amostras, só muda o filtro.",
      costPerImageUsd: null,
      requiresNetwork: true,
    },
    casos,
    amostras
  );

  fs.writeFileSync(
    SAIDA,
    JSON.stringify(
      {
        executadoEm: new Date().toISOString(),
        imagens: casos.length,
        repeticoes: Math.max(...[...amostras.values()].map((l) => l.length)),
        degradacoesPuladas: ["ruido"],
        candidatos: [relatorio],
      },
      null,
      2
    )
  );

  const t = relatorio.totais;
  console.log(
    `F* (ablacao) telefone: ${t.telefone.corretas}/${t.telefone.total}, ` +
      `${t.telefone.falsoConfiante} falso confiante, ${t.telefone.ausentes} ausentes | ` +
      `valor: ${t.valor.corretas}/${t.valor.total}, ${t.valor.falsoConfiante} falso confiante | ` +
      `nome: ${t.nome.corretas}/${t.nome.total}`
  );
}

main();
