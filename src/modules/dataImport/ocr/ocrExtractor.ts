/**
 * Extrator de imagem para importação.
 *
 * Converte uma imagem (PNG/JPG/WEBP) em `ParsedSheet[]` — o mesmo contrato
 * que `readSpreadsheetSheets` devolve para planilhas — para reaproveitar
 * mapeamento, validação, preview e commit do pipeline existente.
 *
 * A imagem vira uma tabela com cabeçalhos **genéricos** ("Coluna 1",
 * "Coluna 2"…): quem decide o que cada coluna significa é o dono, na etapa de
 * mapeamento, exatamente como na importação de planilha. O OCR não adivinha o
 * destino nem o campo de cada coluna.
 *
 * Cada coluna da tabela guarda a confiança da leitura (a menor entre as
 * palavras lidas naquela célula): é ela que o gate de falso confiante usa
 * para decidir o que o dono precisa revisar.
 */
import type { ParsedSpreadsheet, ImportRawRow } from "../dataImport.types";
import { clusterColumnsX, type CelulaOcr } from "./colunas";
import { ocrImage } from "./ocrWorker";
import { AppError } from "@/shared/errors/AppError";
import type { OcrCellResult, OcrSheetResult } from "./ocr.types";

export type { OcrCellResult, OcrSheetResult } from "./ocr.types";

/** Agrupa palavras em linhas por sobreposição vertical (mesma regra do spike). */
function agruparLinhas(
  palavras: CelulaOcr[],
): CelulaOcr[][] {
  const ordenadas = [...palavras].sort(
    (a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0,
  );
  const linhas: CelulaOcr[][] = [];

  for (const palavra of ordenadas) {
    const centroY = (palavra.bbox.y0 + palavra.bbox.y1) / 2;
    let alvo: CelulaOcr[] | null = null;
    for (const linha of linhas) {
      const algumNaFaixa = linha.some((c) => {
        const cy = (c.bbox.y0 + c.bbox.y1) / 2;
        return Math.abs(centroY - cy) < 18;
      });
      if (algumNaFaixa) {
        alvo = linha;
        break;
      }
    }
    if (!alvo) {
      alvo = [];
      linhas.push(alvo);
    }
    alvo.push(palavra);
  }

  return linhas.map((linha) =>
    [...linha].sort((a, b) => a.bbox.x0 - b.bbox.x0),
  );
}

/**
 * Extrai as palavras (com caixa e confiança) do resultado do Tesseract.
 *
 * O tesseract.js v7 devolve a hierarquia bloco → parágrafo → linha → palavra;
 * cada palavra traz `bbox` (x0/y0/x1/y1 em pixels) e `confidence` (0-100).
 */
function extrairPalavras(
  result: Awaited<ReturnType<typeof ocrImage>>,
): CelulaOcr[] {
  const blocos = result.data.blocks ?? [];
  const palavras: CelulaOcr[] = [];

  for (const bloco of blocos) {
    for (const paragrafo of bloco.paragraphs) {
      for (const linha of paragrafo.lines) {
        for (const palavra of linha.words) {
          const texto = String(palavra.text ?? "").trim();
          if (!texto) continue;
          const confianca = Number(palavra.confidence ?? 0);
          palavras.push({
            text: texto,
            confidence: Number.isFinite(confianca) ? confianca : 0,
            bbox: {
              x0: palavra.bbox.x0,
              y0: palavra.bbox.y0,
              x1: palavra.bbox.x1,
              y1: palavra.bbox.y1,
            },
          });
        }
      }
    }
  }

  return palavras;
}

/** Detecta colunas pela coordenada x das células. */
function detectarColunasX(linhas: CelulaOcr[][]): number[] {
  const centros: number[] = [];
  for (const linha of linhas) {
    for (const c of linha) {
      centros.push((c.bbox.x0 + c.bbox.x1) / 2);
    }
  }
  return clusterColumnsX(centros, 6);
}

/** Largura da região da tabela (extensão horizontal das palavras lidas). */
function larguraDaTabela(palavras: CelulaOcr[]): number {
  if (!palavras.length) return 0;
  const x0 = Math.min(...palavras.map((p) => p.bbox.x0));
  const x1 = Math.max(...palavras.map((p) => p.bbox.x1));
  return Math.max(0, Math.round(x1 - x0));
}

/**
 * Converte um resultado de OCR em ParsedSheet + células com confiança.
 *
 * `larguraImagemPx` vem do `sharp` (o Tesseract não devolve as dimensões da
 * imagem) e é usada só para diagnóstico.
 */
export async function extrairImagem(
  imageBuffer: Buffer,
  fileName: string,
  larguraImagemPx = 0,
): Promise<OcrSheetResult> {
  let result;
  try {
    result = await ocrImage(imageBuffer);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "Não foi possível ler a imagem. Tente outra foto com melhor iluminação.",
      400,
      undefined,
      "OCR_READ_FAILED",
    );
  }

  const palavras = extrairPalavras(result);
  const linhas = agruparLinhas(palavras);
  const colunasX = detectarColunasX(linhas);
  const nColunas = Math.max(colunasX.length, 1);
  const larguraTabelaPx = larguraDaTabela(palavras);

  // Cabeçalhos genéricos: o destino e o mapeamento são escolhidos pelo dono.
  const headers: string[] = [];
  for (let i = 0; i < nColunas; i += 1) {
    headers.push(`Coluna ${i + 1}`);
  }

  const rows: ImportRawRow[] = [];
  const celulas: OcrCellResult[][] = [];

  for (let linhaIdx = 0; linhaIdx < linhas.length; linhaIdx += 1) {
    const linha = linhas[linhaIdx];
    const row: ImportRawRow = {};
    const linhaCelulas: OcrCellResult[] = [];

    // Agrupa as palavras da linha por coluna.
    const porColuna = new Map<number, CelulaOcr[]>();
    for (const celula of linha) {
      const x = (celula.bbox.x0 + celula.bbox.x1) / 2;
      let colunaIdx = 0;
      let dist = Infinity;
      for (let i = 0; i < colunasX.length; i += 1) {
        const d = Math.abs(x - colunasX[i]);
        if (d < dist) {
          dist = d;
          colunaIdx = i;
        }
      }
      const lista = porColuna.get(colunaIdx);
      if (lista) lista.push(celula);
      else porColuna.set(colunaIdx, [celula]);
    }

    for (const [colunaIdx, lista] of [...porColuna.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      const header = headers[colunaIdx] ?? `Coluna ${colunaIdx + 1}`;
      const valor = lista
        .map((c) => c.text)
        .join(" ")
        .trim();
      // A confiança da célula é a menor entre as palavras: é a parte que o
      // dono precisa conferir.
      const confianca = Math.min(...lista.map((c) => c.confidence ?? 0));

      row[header] = valor;
      linhaCelulas.push({
        valor,
        confianca: Number.isFinite(confianca) ? confianca : null,
        origem: "ocr",
        linha: linhaIdx + 1,
        coluna: colunaIdx,
      });
    }

    rows.push(row);
    celulas.push(linhaCelulas);
  }

  const sheet: ParsedSpreadsheet = {
    headers,
    rows,
    sheetNames: [fileName],
    selectedSheet: fileName,
  };

  return { sheet, celulas, headers, larguraTabelaPx, larguraImagemPx };
}
