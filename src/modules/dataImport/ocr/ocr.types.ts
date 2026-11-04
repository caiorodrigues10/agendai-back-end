/**
 * Tipos do OCR de importação de imagens.
 *
 * Ficam num arquivo só porque são usados pelo extrator, pelo serviço de
 * importação, pelo arquivo do lote (persistência) e pelo gate de revisão.
 */
import type { ParsedSpreadsheet } from "../dataImport.types";

/** Uma célula lida pelo OCR (uma coluna de uma linha da tabela da imagem). */
export interface OcrCellResult {
  /** Texto extraído da célula. */
  valor: string;
  /** Confiança do OCR (0-100). `null` quando o motor não informou. */
  confianca: number | null;
  /** Sempre "ocr" — usado pelo gate de falso confiante. */
  origem: "ocr";
  /** Número da linha (1-based) na tabela extraída. */
  linha: number;
  /** Índice da coluna detectada (0-based). */
  coluna: number;
}

/** Resultado da extração de uma imagem. */
export interface OcrSheetResult {
  /** A tabela extraída no mesmo formato de uma planilha. */
  sheet: ParsedSpreadsheet;
  /** Células com confiança, por linha (`celulas[linha][coluna]`). */
  celulas: OcrCellResult[][];
  /** Cabeçalhos genéricos ("Coluna 1", "Coluna 2"…). */
  headers: string[];
  /**
   * Largura da **região da tabela** em pixels (extensão horizontal das
   * palavras lidas) — é este número que o piso de resolução mede
   * (REPORT.md linha 80: "Esse número é a largura da tabela, não da imagem").
   */
  larguraTabelaPx: number;
  /** Largura da imagem em pixels (só para diagnóstico). */
  larguraImagemPx: number;
}

/** Estado de uma célula do OCR entre a extração e a importação. */
export interface OcrCellState {
  /** Linha (1-based). */
  linha: number;
  /** Coluna (0-based). */
  coluna: number;
  /** Confiança do OCR na leitura (0-100). */
  confianca: number | null;
  /** Valor lido (ou corrigido pelo dono). */
  valor: string;
  /** O dono aceitou o valor como está, sem corrigir. */
  aceito: boolean;
  /** O dono corrigiu o valor na tela de revisão. */
  editado: boolean;
}

/**
 * Arquivo lateral do lote de OCR: guarda a confiança por célula e o que o
 * dono já revisou. Vive ao lado do CSV do lote — sem coluna nova no banco.
 */
export interface OcrSidecar {
  versao: 1;
  origem: "ocr";
  /** Cabeçalhos genéricos da tabela lida ("Coluna 1"…). */
  headers: string[];
  larguraTabelaPx: number;
  larguraImagemPx: number;
  celulas: OcrCellState[];
}
