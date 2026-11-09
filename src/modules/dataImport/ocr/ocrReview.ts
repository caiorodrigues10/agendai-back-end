/**
 * Gate do OCR → Cells "para revisar" da linha.
 *
 * É o elo entre a leitura da imagem e a tela de revisão: o
 * `gateOcrLinha` diz quais células têm leitura duvidosa (campo crítico com
 * confiança baixa, valor que passa no normalizador mas pode ser falso
 * confiante, número de processo com formato suspeito) e esta função traduz o
 * veredito em "revisar" para a linha, usando o mapeamento coluna → campo que
 * o **dono** escolheu.
 *
 * Funções puras: sem banco, sem rede, sem arquivo. O estado da revisão (o que
 * o dono já corrigiu ou aceitou) entra como argumento.
 */
import { gateOcrLinha } from "./falseConfidenceGate";
import type { OcrCellResult, OcrCellState } from "./ocr.types";

/** Uma célula da linha que o dono precisa conferir. */
export interface OcrCelulaRevisar {
  /** Linha da tabela lida (1-based, como no arquivo lateral do lote). */
  linha: number;
  /** Índice da coluna (0-based). */
  coluna: number;
  /** Campo de destino escolhido pelo dono (ou "Coluna N" se não mapeado). */
  campo: string;
  /** Valor lido (ou já corrigido pelo dono). */
  valor: string;
  /** Confiança do OCR (0-100). */
  confianca: number | null;
  /** Por que a célula foi marcada. */
  motivo: string | null;
  /** Ainda espera o dono? (corrigir ou aceitar explicitamente). */
  pendente: boolean;
  /** O dono aceitou o valor como está. */
  aceito: boolean;
  /** O dono corrigiu o valor. */
  editado: boolean;
}

/** Veredito de uma linha inteira. */
export interface OcrVereditoLinha {
  /** A linha tem alguma célula esperando o dono? */
  revisar: boolean;
  /** Todas as células marcadas (resolvidas ou pendentes). */
  celulas: OcrCelulaRevisar[];
  /** Quantas células ainda esperam o dono. */
  pendentes: number;
}

/** Chave estável de uma célula (linha 1-based, coluna 0-based). */
export function chaveCelula(linha: number, coluna: number): string {
  return `${linha}:${coluna}`;
}

/** Monta o índice de estado das células (o que o dono já revisou). */
export function indexarEstados(celulas: OcrCellState[]): Map<string, OcrCellState> {
  const indice = new Map<string, OcrCellState>();
  for (const celula of celulas) {
    indice.set(chaveCelula(celula.linha, celula.coluna), celula);
  }
  return indice;
}

/**
 * Avalia uma linha do OCR.
 *
 * `colunaParaCampo` é o mapeamento escolhido pelo dono (índice da coluna →
 * campo de destino): sem ele o gate não sabe qual coluna é o telefone e
 * qual é o valor.
 */
export function avaliarLinhaOcr(
  celulas: OcrCellResult[],
  colunaParaCampo: Map<number, string>,
  estados: Map<string, OcrCellState> = new Map(),
): OcrVereditoLinha {
  const vereditos = gateOcrLinha(celulas, colunaParaCampo);
  const linha = celulas[0]?.linha ?? 1;
  const porColuna = new Map(celulas.map((c) => [c.coluna, c]));

  const marcadas: OcrCelulaRevisar[] = vereditos
    .filter((item) => item.verdict.revisar)
    .map((item) => {
      const celula = porColuna.get(item.coluna);
      const estado = estados.get(chaveCelula(linha, item.coluna));
      const aceito = estado?.aceito ?? false;
      const editado = estado?.editado ?? false;
      return {
        linha,
        coluna: item.coluna,
        campo: item.campo,
        valor: estado?.valor ?? celula?.valor ?? "",
        confianca: celula?.confianca ?? null,
        motivo: item.verdict.motivo,
        pendente: !aceito && !editado,
        aceito,
        editado,
      };
    });

  const pendentes = marcadas.filter((c) => c.pendente).length;
  return { revisar: pendentes > 0, celulas: marcadas, pendentes };
}
