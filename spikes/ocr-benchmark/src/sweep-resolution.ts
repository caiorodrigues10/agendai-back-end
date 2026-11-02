/**
 * Varredura de resolução para A e B.
 *
 * Pega as 6 imagens de print limpo e reduz para 100%, 75%, 50% e 35% da
 * largura original. Mede, por escala, o acerto e o falso confiante por
 * coluna — e mostra onde o pipeline local deixa de funcionar.
 *
 * Saída: resultados/resolucao.json
 * Uso: npx tsx src/sweep-resolution.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { align, canonMoney, canonName, canonPhone, type GroundTruthRow } from "./evaluate";
import { tesseractTexto } from "./candidates/a-tesseract-texto";
import { tesseractLayout } from "./candidates/b-tesseract-layout";
import { closeTesseractWorker } from "./ocr-utils";
import type { Candidate } from "./types";

const ROOT = path.resolve(__dirname, "..");
const DATASET = path.join(ROOT, "dataset");
const IMAGES = path.join(DATASET, "images");
const OUT_DIR = path.join(DATASET, "resolution");
const SAIDA = path.join(ROOT, "resultados", "resolucao.json");

interface TruthFile {
  casos: Array<{ id: string; degradation: string; rows: GroundTruthRow[] }>;
}

const ESCALAS = [1, 0.75, 0.5, 0.35];

interface ColunaMedida {
  total: number;
  corretas: number;
  ausentes: number;
  falsoConfiante: number;
}

const vazia = (v: string | number | null): boolean => v === null || v === undefined || v === "";

function medir(
  pares: ReturnType<typeof align>,
  coluna: "nome" | "telefone" | "valor"
): ColunaMedida {
  const canon = coluna === "nome" ? canonName : coluna === "telefone" ? canonPhone : canonMoney;
  const m: ColunaMedida = { total: 0, corretas: 0, ausentes: 0, falsoConfiante: 0 };
  for (const par of pares) {
    m.total++;
    const esperado = canon(par.truth[coluna]);
    const obtido = par.extraida ? canon(par.extraida[coluna]) : null;
    if (vazia(obtido)) {
      m.ausentes++;
      continue;
    }
    if (!vazia(esperado) && obtido === esperado) {
      m.corretas++;
      continue;
    }
    // Errada: se normaliza, passaria pela validação.
    m.falsoConfiante++;
  }
  return m;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const truth = JSON.parse(fs.readFileSync(path.join(DATASET, "ground-truth.json"), "utf8")) as TruthFile;
  const bases = truth.casos.filter((c) => c.degradation === "print-limpo");

  const candidatos: Candidate[] = [tesseractTexto, tesseractLayout];
  const resultados = [];

  for (const escala of ESCALAS) {
    const pct = Math.round(escala * 100);
    const porCandidato = [];

    for (const candidato of candidatos) {
      const agregado: Record<"nome" | "telefone" | "valor", ColunaMedida> = {
        nome: { total: 0, corretas: 0, ausentes: 0, falsoConfiante: 0 },
        telefone: { total: 0, corretas: 0, ausentes: 0, falsoConfiante: 0 },
        valor: { total: 0, corretas: 0, ausentes: 0, falsoConfiante: 0 },
      };
      let larguras: number[] = [];
      let largurasTabela: number[] = [];

      for (const caso of bases) {
        const origem = path.join(IMAGES, `${caso.id}.jpg`);
        const meta = await sharp(origem).metadata();
        const largura = Math.max(1, Math.round((meta.width ?? 900) * escala));
        const destino = path.join(OUT_DIR, `${caso.id}-${pct}.jpg`);
        await sharp(origem)
          .resize({ width: largura, kernel: "lanczos3" })
          .jpeg({ quality: 88 })
          .toFile(destino);
        larguras.push(largura);
        // A tabela ocupa a largura do SVG menos 18 px de margem de cada lado.
        largurasTabela.push(Math.max(1, Math.round(largura - 36 * escala)));

        const r = await candidato.extract(destino);
        const pares = align(caso.rows, r.rows);
        for (const coluna of ["nome", "telefone", "valor"] as const) {
          const m = medir(pares, coluna);
          agregado[coluna].total += m.total;
          agregado[coluna].corretas += m.corretas;
          agregado[coluna].ausentes += m.ausentes;
          agregado[coluna].falsoConfiante += m.falsoConfiante;
        }
      }

      porCandidato.push({
        candidato: candidato.id,
        larguraPx: Math.round(larguras.reduce((s, l) => s + l, 0) / Math.max(1, larguras.length)),
        larguraTabelaPx: Math.round(
          largurasTabela.reduce((s, l) => s + l, 0) / Math.max(1, largurasTabela.length)
        ),
        colunas: agregado,
      });
      console.log(`${pct}% · ${candidato.id}: tel ${agregado.telefone.corretas}/${agregado.telefone.total}`);
    }

    resultados.push({ escala: pct, candidatos: porCandidato });
  }

  // Critério de "funciona": telefone e valor ≥90% exatos e nenhum falso
  // confiante em telefone/valor.
  const funciona = resultados
    .map((r) => ({
      escala: r.escala,
      ok: r.candidatos.some((c) => {
        const t = c.colunas.telefone;
        const v = c.colunas.valor;
        return (
          t.corretas / Math.max(1, t.total) >= 0.9 &&
          v.corretas / Math.max(1, v.total) >= 0.9 &&
          t.falsoConfiante === 0 &&
          v.falsoConfiante === 0
        );
      }),
    }))
    .sort((a, b) => a.escala - b.escala)
    .find((r) => r.ok);

  fs.writeFileSync(
    SAIDA,
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        bases: bases.map((c) => c.id),
        escalas: resultados,
        criterio: "telefone e valor ≥90% exatos e 0 falso confiante em telefone/valor",
        menorEscalaQueFunciona: funciona?.escala ?? null,
      },
      null,
      2
    )
  );

  console.log(`\nResolução em ${SAIDA}`);
  console.log(`menor escala que funciona: ${funciona?.escala ?? "nenhuma"}%`);
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
