/**
 * Extrator de imagem para importação.
 *
 * Converte uma imagem (PNG/JPG/WEBP) em `ParsedSheet[]` — o mesmo contrato
 * que `readSpreadsheetSheets` devolve para planilhas — para reaproveitar
 * mapeamento, validação, preview e commit do pipeline existente.
 *
 * Cada linha vira um registro com headers genéricos ("Coluna 1", "Coluna 2"…)
 * ou semânticos ("Nome", "Telefone", "Valor") quando o padrão de tabela for
 * reconhecido. As confianças por célula são mantidas em paralelo para o gate
 * de falso confiante.
 */
import type { ParsedSpreadsheet, ImportRawRow } from "../dataImport.types";
import { distribuirColunas, type CelulaOcr, clusterColumnsX } from "./colunas";
import { ocrImage } from "./ocrWorker";
import { AppError } from "@/shared/errors/AppError";

export interface OcrCellResult {
  /** Texto extraído da célula. */
  valor: string;
  /** Confiança do OCR (0-100), quando disponível. */
  confianca: number | null;
  /** Sempre "ocr" — usado pelo gate de falso confiante. */
  origem: "ocr";
  /** Número da linha (1-based) na planilha extraída. */
  linha: number;
  /** Índice da coluna detectada. */
  coluna: number;
}

export interface OcrSheetResult {
  sheet: ParsedSpreadsheet;
  /** Células com confiança, indexadas por [linha][coluna]. */
  celulas: OcrCellResult[][];
  /** Largura da imagem detectada (para verificação de piso). */
  larguraPx: number;
}

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

/** Extrai células com confiança do resultado do Tesseract. */
function extrairCelulas(
  result: Awaited<ReturnType<typeof ocrImage>>,
): CelulaOcr[] {
  const data = (result.data ?? {}) as Record<string, any>;
  const textos: string[] = data.text ?? [];
  const confs: number[] = data.confidence ?? [];
  const lefts: number[] = data.left ?? [];
  const tops: number[] = data.top ?? [];
  const widths: number[] = data.width ?? [];
  const heights: number[] = data.height ?? [];

  const palavras: CelulaOcr[] = [];
  for (let i = 0; i < textos.length; i += 1) {
    const texto = String(textos[i] ?? "").trim();
    if (!texto) continue;
    const conf = Number(confs[i] ?? -1);
    palavras.push({
      text: texto,
      confidence: conf >= 0 ? conf : 0,
      bbox: {
        x0: Number(lefts[i] ?? 0),
        y0: Number(tops[i] ?? 0),
        x1: Number((lefts[i] ?? 0) + (widths[i] ?? 0)),
        y1: Number((tops[i] ?? 0) + (heights[i] ?? 0)),
      },
    });
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

/** Converte um resultado de OCR em ParsedSheet + confianças por célula. */
export async function extrairImagem(
  imageBuffer: Buffer,
  fileName: string,
): Promise<OcrSheetResult> {
  let result;
  try {
    result = await ocrImage(imageBuffer);
  } catch (err) {
    throw new AppError(
      "Não foi possível ler a imagem. Tente outra foto com melhor iluminação.",
      400,
    );
  }

  const palavras = extrairCelulas(result);
  const larguraPx = Math.max(
    ...palavras.map((p) => p.bbox.x1),
    Number((result.data as { width?: number } | undefined)?.width ?? 0),
  );
  const linhas = agruparLinhas(palavras);
  const colunasX = detectarColunasX(linhas);
  const nColunas = Math.max(colunasX.length, 1);

  // Headers genéricos; podem ser sobrescritos por semânticos abaixo.
  const headers: string[] = [];
  for (let i = 0; i < nColunas; i += 1) {
    headers.push(`Coluna ${i + 1}`);
  }

  const larguraRef = larguraPx || 1000;
  const rows: ImportRawRow[] = [];
  const celulas: OcrCellResult[][] = [];

  for (let linhaIdx = 0; linhaIdx < linhas.length; linhaIdx += 1) {
    const linha = linhas[linhaIdx];
    const row: ImportRawRow = Object.create(null);
    const linhaCelulas: OcrCellResult[] = [];

    // Distribuição semântica (nome/telefone/valor) quando houver padrão de tabela.
    const distribuicao = distribuirColunas(
      linha.map((c) => ({ text: c.text, bbox: c.bbox })),
      larguraRef,
    );

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

      const header = headers[colunaIdx] ?? `Coluna ${colunaIdx + 1}`;
      const atual = row[header] ?? "";
      row[header] = atual ? `${atual} ${celula.text}` : celula.text;

      linhaCelulas.push({
        valor: celula.text,
        confianca: celula.confidence ?? null,
        origem: "ocr",
        linha: linhaIdx + 1,
        coluna: colunaIdx,
      });
    }

    // Sobrescreve com headers semânticos quando a distribuição encontrou padrão.
    if (distribuicao.nome.length) row["Nome"] = distribuicao.nome.join(" ");
    if (distribuicao.telefone) row["Telefone"] = distribuicao.telefone;
    if (distribuicao.valor) row["Valor"] = distribuicao.valor;

    rows.push(row);
    celulas.push(linhaCelulas);
  }

  const sheet: ParsedSpreadsheet = {
    headers,
    rows,
    sheetNames: [fileName],
    selectedSheet: fileName,
  };

  return { sheet, celulas, larguraPx };
}
