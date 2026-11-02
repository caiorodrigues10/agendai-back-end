/**
 * Avaliação do spike: alinha as linhas extraídas com o ground truth e mede
 * as métricas por coluna.
 *
 * Métrica central do spike — **falso confiante**: o valor extraído está
 * *errado* mas ainda *passa* pela normalização de produção. É o pior
 * resultado possível: não é recusado (entra no CRM) e está errado (contato
 * errado, valor errado). Exemplo: o telefone real era 11987654321 e o OCR
 * leu 11987654327 — 11 dígitos, normaliza, e vai para o cadastro de outra
 * pessoa.
 */
import { normalizeMoney, normalizePhone } from "../../../src/modules/dataImport/utils/rowNormalization";
import type { ExtractedRow } from "./types";

export interface GroundTruthRow {
  nome: string;
  telefone: string;
  valor: string;
}

export interface ColumnMetrics {
  /** Células do ground truth avaliadas. */
  total: number;
  /** Extraída e idêntica ao ground truth (após normalização). */
  corretas: number;
  /** Extraída, mas errada. */
  erradas: number;
  /** Não extraída (ou linha não localizada). */
  ausentes: number;
  /** Das erradas: quantas normalizam como dado válido (falso confiante). */
  falsoConfiante: number;
  /** Das erradas: quantas NÃO normalizam (erro detectável — seria recusado). */
  erroDetectavel: number;
}

export interface ImageMetrics {
  id: string;
  degradation: string;
  totalLinhasTruth: number;
  /** Linhas do ground truth que o candidato não localizou. */
  linhasNaoLocalizadas: number;
  /** Linhas extraídas que não correspondem a nenhuma linha do truth (ex.: TOTAL). */
  linhasFantasma: number;
  /** Linhas com as 3 células corretas (não precisam de revisão). */
  linhasCompletas: number;
  /** Linhas com pelo menos uma célula errada/ausente (precisam de revisão). */
  linhasRevisao: number;
  /** Linhas com telefone/valor errado mas que normaliza (risco silencioso). */
  linhasFalsoConfiante: number;
  colunas: Record<keyof GroundTruthRow, ColumnMetrics>;
}

export interface CandidateReport {
  id: string;
  label: string;
  description: string;
  costPerImageUsd: number | null;
  requiresNetwork: boolean;
  images: ImageMetrics[];
  /** Totais somados de todas as imagens. */
  totais: Record<keyof GroundTruthRow, ColumnMetrics>;
  /** Tempo total e médio por imagem. */
  tempoTotalMs: number;
  tempoMedioMs: number;
  /** Imagens com erro do candidato. */
  imagensComErro: number;
  erros: string[];
  /** Quantas execuções por imagem foram feitas (repetições). */
  execucoesPorImagem: number;
  /** Execuções que precisaram de retry no provedor (candidatos de rede). */
  chamadasComRetry: number;
  /** Execuções que terminaram com erro (provedor vazio etc.). */
  execucoesComErro: number;
  /** Execuções totais feitas para o candidato. */
  execucoesTotais: number;
  /** Linhas avaliadas (truth × execuções). */
  linhasTotal: number;
  linhasCompletas: number;
  linhasRevisao: number;
  linhasFalsoConfiante: number;
  linhasFantasma: number;
}

/** Chave canônica de telefone (dígitos normalizados) ou null. */
export function canonPhone(value: string | undefined): string | null {
  if (!value) return null;
  return normalizePhone(value);
}

/** Chave canônica de valor (número) ou null. */
export function canonMoney(value: string | undefined): number | null {
  if (!value) return null;
  return normalizeMoney(value);
}

/** Nome canônico: minúsculas, sem acento, espaços colapsados. */
export function canonName(value: string | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface Aligned {
  truth: GroundTruthRow;
  extraida: ExtractedRow | null;
}

/**
 * Alinha as linhas extraídas com o ground truth por pontuação (nome +
 * telefone + valor). Greedy: cada linha do truth pega a melhor linha
 * extraída ainda livre.
 */
export function align(truth: GroundTruthRow[], extraidas: ExtractedRow[]): Aligned[] {
  const usadas = new Set<number>();
  const aligned: Aligned[] = [];

  for (const t of truth) {
    let melhorIdx = -1;
    let melhorScore = 0;
    for (let i = 0; i < extraidas.length; i++) {
      if (usadas.has(i)) continue;
      const e = extraidas[i];
      let score = 0;
      if (canonName(e.nome) && canonName(e.nome) === canonName(t.nome)) score += 3;
      const ep = canonPhone(e.telefone);
      const tp = canonPhone(t.telefone);
      if (ep && tp && ep === tp) score += 3;
      const ev = canonMoney(e.valor);
      const tv = canonMoney(t.valor);
      if (ev !== null && tv !== null && ev === tv) score += 2;
      if (score > melhorScore) {
        melhorScore = score;
        melhorIdx = i;
      }
    }
    // Score mínimo 2: sem nenhum campo coincidente, não é a mesma linha.
    if (melhorIdx >= 0 && melhorScore >= 2) {
      usadas.add(melhorIdx);
      aligned.push({ truth: t, extraida: extraidas[melhorIdx] });
    } else {
      aligned.push({ truth: t, extraida: null });
    }
  }

  return aligned;
}

function emptyMetrics(): ColumnMetrics {
  return {
    total: 0,
    corretas: 0,
    erradas: 0,
    ausentes: 0,
    falsoConfiante: 0,
    erroDetectavel: 0,
  };
}

/**
 * Mede uma coluna entre as linhas alinhadas.
 *
 * `confiavel` responde: dado que passou pela normalização de produção é
 * considerado importável? Para telefone e valor isso define o falso
 * confiante.
 */
function measureColumn(
  aligned: Aligned[],
  coluna: keyof GroundTruthRow,
  normaliza: (v: string | undefined) => string | number | null
): ColumnMetrics {
  const m = emptyMetrics();
  for (const { truth, extraida } of aligned) {
    m.total++;
    const esperado = normaliza(truth[coluna]);
    const obtido = extraida ? normaliza(extraida[coluna]) : null;

    if (obtido === null || obtido === undefined || obtido === "") {
      m.ausentes++;
      continue;
    }
    if (esperado !== null && esperado !== undefined && esperado !== "" && obtido === esperado) {
      m.corretas++;
      continue;
    }
    m.erradas++;
    // Errada: se normaliza como dado válido, é falso confiante (passaria
    // pela validação de produção e entraria errado).
    if (obtido !== null) m.falsoConfiante++;
    else m.erroDetectavel++;
  }
  return m;
}

/**
 * Avalia um candidato em todas as imagens.
 *
 * `amostras` guarda N execuções por imagem (repetições). As métricas são
 * somadas sobre todas as amostras: `total` passa a ser células × repetições.
 * Isso deixa visível a variância de candidatos não determinísticos (LLM).
 */
export function evaluateCandidate(
  candidato: {
    id: string;
    label: string;
    description: string;
    costPerImageUsd: number | null;
    requiresNetwork: boolean;
  },
  casos: Array<{ id: string; degradation: string; rows: GroundTruthRow[] }>,
  amostras: Map<string, Array<{ rows: ExtractedRow[]; elapsedMs: number; error?: string; attempts?: number }>>
): CandidateReport {
  const images: ImageMetrics[] = [];
  const erros: string[] = [];
  let tempoTotalMs = 0;
  let imagensComErro = 0;
  let execucoes = 0;
  let chamadasComRetry = 0;
  let execucoesComErro = 0;

  for (const caso of casos) {
    const runs = amostras.get(caso.id) ?? [];
    const soma: ImageMetrics = {
      id: caso.id,
      degradation: caso.degradation,
      totalLinhasTruth: caso.rows.length,
      linhasNaoLocalizadas: 0,
      linhasFantasma: 0,
      linhasCompletas: 0,
      linhasRevisao: 0,
      linhasFalsoConfiante: 0,
      colunas: {
        nome: emptyMetrics(),
        telefone: emptyMetrics(),
        valor: emptyMetrics(),
      },
    };

    for (const r of runs) {
      execucoes++;
      tempoTotalMs += r.elapsedMs;
      if ((r.attempts ?? 1) > 1) chamadasComRetry++;
      if (r.error) execucoesComErro++;
      if (r.error) {
        imagensComErro++;
        erros.push(`${caso.id}: ${r.error}`);
      }
      const extraidas = r.rows ?? [];
      const aligned = align(caso.rows, extraidas);

      soma.linhasNaoLocalizadas += aligned.filter((a) => !a.extraida).length;
      soma.linhasFantasma += Math.max(0, extraidas.length - aligned.filter((a) => a.extraida).length);

      for (const par of aligned) {
        const celulas = {
          nome: [canonName(par.truth.nome), par.extraida ? canonName(par.extraida.nome) : null],
          telefone: [canonPhone(par.truth.telefone), par.extraida ? canonPhone(par.extraida.telefone) : null],
          valor: [canonMoney(par.truth.valor), par.extraida ? canonMoney(par.extraida.valor) : null],
        } as const;
        const completa = (["nome", "telefone", "valor"] as const).every((chave) => {
          const [esperado, obtido] = celulas[chave];
          if (obtido === null || obtido === "" || obtido === undefined) return false;
          if (esperado === null || esperado === "" || esperado === undefined) return false;
          return obtido === esperado;
        });
        if (completa) {
          soma.linhasCompletas++;
        } else {
          soma.linhasRevisao++;
          const perigosa = (["telefone", "valor"] as const).some((chave) => {
            const [esperado, obtido] = celulas[chave];
            if (obtido === null || obtido === "" || obtido === undefined) return false;
            if (esperado !== null && esperado !== undefined && esperado !== "" && obtido === esperado) {
              return false;
            }
            return true;
          });
          if (perigosa) soma.linhasFalsoConfiante++;
        }
      }

      const medidas = {
        nome: measureColumn(aligned, "nome", canonName),
        telefone: measureColumn(aligned, "telefone", canonPhone),
        valor: measureColumn(aligned, "valor", canonMoney),
      };
      for (const chave of ["nome", "telefone", "valor"] as const) {
        const destino = soma.colunas[chave];
        const origem = medidas[chave];
        destino.total += origem.total;
        destino.corretas += origem.corretas;
        destino.erradas += origem.erradas;
        destino.ausentes += origem.ausentes;
        destino.falsoConfiante += origem.falsoConfiante;
        destino.erroDetectavel += origem.erroDetectavel;
      }
    }

    images.push(soma);
  }

  const totais = {
    nome: emptyMetrics(),
    telefone: emptyMetrics(),
    valor: emptyMetrics(),
  };
  for (const img of images) {
    for (const chave of ["nome", "telefone", "valor"] as const) {
      const t = totais[chave];
      const i = img.colunas[chave];
      t.total += i.total;
      t.corretas += i.corretas;
      t.erradas += i.erradas;
      t.ausentes += i.ausentes;
      t.falsoConfiante += i.falsoConfiante;
      t.erroDetectavel += i.erroDetectavel;
    }
  }

  return {
    id: candidato.id,
    label: candidato.label,
    description: candidato.description,
    costPerImageUsd: candidato.costPerImageUsd,
    requiresNetwork: candidato.requiresNetwork,
    images,
    totais,
    tempoTotalMs,
    tempoMedioMs: execucoes ? Math.round(tempoTotalMs / execucoes) : 0,
    imagensComErro,
    erros,
    execucoesPorImagem: execucoes / Math.max(1, casos.length),
    chamadasComRetry,
    execucoesComErro,
    execucoesTotais: execucoes,
    linhasTotal: images.reduce((s, i) => s + i.totalLinhasTruth, 0),
    linhasCompletas: images.reduce((s, i) => s + i.linhasCompletas, 0),
    linhasRevisao: images.reduce((s, i) => s + i.linhasRevisao, 0),
    linhasFalsoConfiante: images.reduce((s, i) => s + i.linhasFalsoConfiante, 0),
    linhasFantasma: images.reduce((s, i) => s + i.linhasFantasma, 0),
  };
}
