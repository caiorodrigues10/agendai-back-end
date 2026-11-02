/**
 * Calibração da confiança do Tesseract (candidato B).
 *
 * Para cada célula extraída, mede a **menor confiança de palavra** da célula
 * e compara com o ground truth. Depois simula limiares: célula abaixo do
 * limiar vai para revisão humana; acima entra automática. A pergunta é
 * quanto do falso confiante sobrevive ao limiar e quanto de revisão ele
 * custa.
 *
 * Saída: resultados/calibracao.json
 * Uso: npx tsx src/calibrate.ts
 */
import fs from "node:fs";
import path from "node:path";
import { align, canonMoney, canonName, canonPhone, type GroundTruthRow } from "./evaluate";
import { extrairComLayout } from "./candidates/b-tesseract-layout";
import { closeTesseractWorker } from "./ocr-utils";

const ROOT = path.resolve(__dirname, "..");
const DATASET = path.join(ROOT, "dataset");
const IMAGES = path.join(DATASET, "images");
const SAIDA = path.join(ROOT, "resultados", "calibracao.json");

interface TruthFile {
  casos: Array<{ id: string; degradation: string; estrutura: string; rows: GroundTruthRow[] }>;
}

type Coluna = "nome" | "telefone" | "valor";
const COLUNAS: Coluna[] = ["nome", "telefone", "valor"];

interface Celula {
  imagem: string;
  estrutura: string;
  coluna: Coluna;
  confianca: number;
  correta: boolean;
  /** Errada mas normaliza como válida (só telefone/valor). */
  falsoConfiante: boolean;
  ausente: boolean;
}

const FAIXAS = [
  { min: 0, max: 50, rotulo: "0–49" },
  { min: 50, max: 60, rotulo: "50–59" },
  { min: 60, max: 70, rotulo: "60–69" },
  { min: 70, max: 80, rotulo: "70–79" },
  { min: 80, max: 90, rotulo: "80–89" },
  { min: 90, max: 100.1, rotulo: "90–100" },
];

const LIMIARES = [50, 60, 70, 75, 80, 85, 90, 95];

function canon(coluna: Coluna, valor: string | undefined): string | number | null {
  if (coluna === "nome") return canonName(valor);
  if (coluna === "telefone") return canonPhone(valor);
  return canonMoney(valor);
}

function vazia(valor: string | number | null): boolean {
  return valor === null || valor === undefined || valor === "";
}

async function main(): Promise<void> {
  const truth = JSON.parse(fs.readFileSync(path.join(DATASET, "ground-truth.json"), "utf8")) as TruthFile;

  const celulas: Celula[] = [];
  const linhas: Array<{ imagem: string; confiancaMinima: number }> = [];

  for (const caso of truth.casos) {
    const imagePath = path.join(IMAGES, `${caso.id}.jpg`);
    if (!fs.existsSync(imagePath)) continue;
    const resultado = await extrairComLayout(imagePath);
    const alinhado = align(caso.rows, resultado.rows);

    for (const par of alinhado) {
      const extraida = par.extraida;
      const confiancas = COLUNAS.map((c) => extraida?.confianca?.[c] ?? 0);
      linhas.push({ imagem: caso.id, confiancaMinima: Math.min(...confiancas) });

      for (const coluna of COLUNAS) {
        const esperado = canon(coluna, par.truth[coluna]);
        const obtido = extraida ? canon(coluna, extraida[coluna]) : null;
        const confianca = extraida?.confianca?.[coluna] ?? 0;
        const ausente = vazia(obtido);
        const correta = !ausente && !vazia(esperado) && obtido === esperado;
        const errada = !ausente && !correta;
        celulas.push({
          imagem: caso.id,
          estrutura: caso.estrutura,
          coluna,
          confianca,
          correta,
          falsoConfiante: errada && (coluna === "nome" ? true : !vazia(obtido)),
          ausente,
        });
      }
    }
    console.log(`${caso.id}: ${alinhado.length} linhas`);
  }

  const porFaixa = COLUNAS.map((coluna) => ({
    coluna,
    faixas: FAIXAS.map((faixa) => {
      const noIntervalo = celulas.filter(
        (c) => c.coluna === coluna && c.confianca >= faixa.min && c.confianca < faixa.max
      );
      return {
        faixa: faixa.rotulo,
        celulas: noIntervalo.length,
        corretas: noIntervalo.filter((c) => c.correta).length,
        erradas: noIntervalo.filter((c) => !c.correta && !c.ausente).length,
        ausentes: noIntervalo.filter((c) => c.ausente).length,
        falsoConfiante: noIntervalo.filter((c) => c.falsoConfiante).length,
      };
    }),
  }));

  // Falso confiante "real" só faz sentido em telefone e valor.
  const confiaveis = celulas.filter((c) => c.coluna !== "nome");
  const totalFalso = confiaveis.filter((c) => c.falsoConfiante).length;
  const totalLinhas = linhas.length;

  const limiares = LIMIARES.map((limiar) => {
    const auto = confiaveis.filter((c) => c.confianca >= limiar);
    const revisao = confiaveis.filter((c) => c.confianca < limiar);
    const autoFalso = auto.filter((c) => c.falsoConfiante).length;
    const autoErradas = auto.filter((c) => !c.correta && !c.ausente).length;
    const autoCorretas = auto.filter((c) => c.correta).length;
    const linhasRevisao = linhas.filter((l) => l.confiancaMinima < limiar).length;
    return {
      limiar,
      celulas: confiaveis.length,
      auto: auto.length,
      revisao: revisao.length,
      revisaoPct: (100 * revisao.length) / Math.max(1, confiaveis.length),
      autoCorretas,
      autoErradas,
      autoFalsoConfiante: autoFalso,
      falsoEvitado: totalFalso - autoFalso,
      linhas: totalLinhas,
      linhasRevisao,
      linhasRevisaoPct: (100 * linhasRevisao) / Math.max(1, totalLinhas),
    };
  });

  fs.writeFileSync(
    SAIDA,
    JSON.stringify(
      {
        geradoEm: new Date().toISOString(),
        fonte: "Tesseract (candidato B), menor confiança de palavra por célula",
        imagens: truth.casos.length,
        totalCelulas: celulas.length,
        totalFalsoConfiante: totalFalso,
        porFaixa,
        limiares,
      },
      null,
      2
    )
  );

  console.log(`\nCalibração em ${SAIDA}`);
  console.log(`falso confiante total (tel+valor): ${totalFalso}`);
  for (const l of limiares) {
    console.log(
      `limiar ${l.limiar}: auto FC=${l.autoFalsoConfiante}, revisão célula=${l.revisaoPct.toFixed(1)}%, ` +
        `revisão linha=${l.linhasRevisaoPct.toFixed(1)}%`
    );
  }
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
