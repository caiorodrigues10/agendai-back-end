/**
 * Tipos e utilitários compartilhados pelos candidatos do spike.
 *
 * O spike NÃO importa nada do backend de propósito: os candidatos são
 * implementações independentes, para medir acurácia de cada abordagem sem
 * o viés de "já está feito". Só a avaliação usa os normalizadores reais
 * (ver `evaluate.ts`), porque a pergunta do spike é justamente o que
 * acontece quando a extração cai na normalização de produção.
 */

/** Uma linha extraída de uma imagem. */
export interface ExtractedRow {
  nome?: string;
  telefone?: string;
  valor?: string;
  /** Confiança do OCR por célula (0–100), quando o motor informa. */
  confianca?: { nome?: number; telefone?: number; valor?: number };
}

export interface ExtractionResult {
  rows: ExtractedRow[];
  /** Texto bruto do OCR (quando houver) — útil para auditar erro. */
  rawText?: string;
  /** Confiança do motor, quando ele informa. */
  confidence?: number;
  /** Milissegundos gastos. */
  elapsedMs: number;
  /** Tentativas de chamada ao provedor (1 = sem retry). */
  attempts?: number;
  /** Erro, quando o candidato não conseguiu extrair nada. */
  error?: string;
}

export interface Candidate {
  id: string;
  label: string;
  /** Descrição curta para a matriz de decisão. */
  description: string;
  /** Custo aproximado por imagem em USD (0 = local/grátis; null = não estimado). */
  costPerImageUsd: number | null;
  /** Depende de rede? */
  requiresNetwork: boolean;
  extract(imagePath: string): Promise<ExtractionResult>;
}
