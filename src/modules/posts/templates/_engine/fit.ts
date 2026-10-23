/**
 * Regras de ajuste automático de layout (fit) do Modelo #1 e derivados.
 *
 * Garantem que o pior caso nunca quebra: nomes longos, 8 itens, sem foto,
 * sem logo. O preço nunca quebra nem some.
 */

export type PillFit = {
  /** Quantidade de linhas exibidas (capped). */
  visibleCount: number;
  /** Serviços ocultos (ex.: "+2 serviços"). */
  hiddenCount: number;
  /** Altura de cada pílula (px). */
  rowHeight: number;
  /** Tamanho de fonte do nome/preço (px). */
  fontSize: number;
};

const PILL_GAP = 14;
const PILL_NOTE_H = 34;

/**
 * Ajusta pílulas pelo nº de itens (1–6 / 7–8 / >8 corta).
 *
 * Com `availableH` (espaço real entre o título e o rodapé), antes de esconder
 * linhas comprime altura/fonte; esconde só o estritamente necessário e nunca
 * deixa a última pílula bater no rodapé.
 */
export function fitPills(count: number, availableH?: number): PillFit {
  const visibleAll = Math.min(count, 8);
  const tiers = [
    { rowHeight: 84, fontSize: 30 },
    { rowHeight: 68, fontSize: 26 },
    { rowHeight: 58, fontSize: 24 },
    { rowHeight: 52, fontSize: 22 },
  ];
  const baseIdx = count <= 6 ? 0 : 1;

  // Altura total das `n` linhas (+ nota "+N serviços" quando sobra oculto).
  const heightOf = (n: number, rowHeight: number): number =>
    n * (rowHeight + PILL_GAP) + (count > n ? PILL_NOTE_H : 0);

  if (availableH === undefined) {
    const t = tiers[baseIdx];
    return { visibleCount: visibleAll, hiddenCount: count - visibleAll, rowHeight: t.rowHeight, fontSize: t.fontSize };
  }

  // 1) todas as linhas couberam em algum tier (do base p/ baixo)?
  for (let i = baseIdx; i < tiers.length; i++) {
    if (heightOf(visibleAll, tiers[i].rowHeight) <= availableH) {
      const t = tiers[i];
      return { visibleCount: visibleAll, hiddenCount: count - visibleAll, rowHeight: t.rowHeight, fontSize: t.fontSize };
    }
  }

  // 2) mesmo no tier mínimo não cabe tudo → reduz visíveis (preço nunca some
  //    sem aviso: sempre sai "+N serviços").
  const min = tiers[tiers.length - 1];
  let visible = visibleAll;
  while (visible > 1 && heightOf(visible, min.rowHeight) > availableH) visible--;
  let chosen = min;
  for (const t of tiers) {
    if (heightOf(visible, t.rowHeight) <= availableH) {
      chosen = t;
      break;
    }
  }
  return { visibleCount: visible, hiddenCount: count - visible, rowHeight: chosen.rowHeight, fontSize: chosen.fontSize };
}

/** Fator de escala de fonte para nome longo (preço nunca afeta). */
export function nameFontScale(name: string): number {
  if (name.length > 24) return 0.78;
  if (name.length > 18) return 0.88;
  return 1;
}

/**
 * Trunca nome com reticências se ainda não couber após a escala.
 * `maxChars` = largura efetiva em caracteres para a fonte/escala dadas.
 */
export function fitName(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name;
  return `${name.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

/** Preço → string pt-BR. Vazio = "sob consulta". */
export function fitPrice(
  price: number | null | undefined,
  opts: { from?: boolean; hideCents?: boolean } = {}
): string {
  if (price === null || price === undefined || Number.isNaN(price)) return "sob consulta";
  let value: string;
  if (opts.hideCents && Number.isInteger(price)) {
    value = `R$ ${price.toLocaleString("pt-BR")}`;
  } else {
    value = price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  return opts.from ? `a partir de ${value}` : value;
}

/** Telefone/WhatsApp pt-BR formatado (parcial se incompleto). */
export function formatPhoneBR(digits: string | null | undefined): string {
  const d = (digits || "").replace(/\D/g, "");
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

/** @instagram → garante '@' e remove chars inválidos. */
export function formatInsta(handle: string | null | undefined): string {
  const h = (handle || "").replace(/[^A-Za-z0-9._]/g, "");
  return h ? `@${h.replace(/^@+/, "")}` : "";
}

/**
 * Altura estimada do bloco de título (linha branca + palavra accent + gaps).
 * Quebra em palavras (gulosa) com fator conservador 0,74 — medido contra os
 * renders reais (4 linhas no feed/square, 2 no story), nunca subestima.
 */
export function estimateTitleH(
  firstPart: string,
  lastWord: string,
  opts: { columnW: number; firstSize: number; lastSize: number; bottomGap?: number }
): number {
  const lines = estimateWrappedLines(firstPart, opts.firstSize, opts.columnW, 0.74);
  return lines * opts.firstSize + Math.round(opts.lastSize * 0.95) + 4 + (opts.bottomGap ?? 40);
}

export type FooterFit = { firstSize: number; restSize: number; height: number };

/** Fator de largura de caixa-alta Montserrat Black (conservador p/ não subestimar). */
const CAP_FACTOR = 0.7;

/** Nº de linhas de um texto quebrado em palavras dentro de `columnW` (estimativa). */
function estimateWrappedLines(text: string, fontSize: number, columnW: number, factor: number): number {
  const space = fontSize * factor;
  const words = text.split(" ").filter(Boolean);
  let lines = 1;
  let cur = 0;
  for (const w of words) {
    const wl = w.length * space;
    const add = cur === 0 ? wl : space + wl;
    if (cur + add > columnW) {
      lines += 1;
      cur = wl;
    } else {
      cur += add;
    }
  }
  return lines;
}

/**
 * Rodapé de marca: encolhe as duas linhas do nome para caber na coluna,
 * conta a quebra real em palavras e devolve a altura do bloco p/ ancorá-lo
 * embaixo do canvas — assim o título+pílulas sabem onde terminar.
 */
export function fitFooter(first: string, rest: string, contact: string, columnW: number): FooterFit {
  const fitSize = (text: string, base: number, min: number): number =>
    Math.max(min, Math.min(base, Math.floor(columnW / Math.max(1, text.length * CAP_FACTOR))));
  const firstSize = fitSize(first, 40, 26);
  const restSize = fitSize(rest, 52, 26);
  const restLines = estimateWrappedLines(rest, restSize, columnW, CAP_FACTOR);
  const contactLines = contact ? estimateWrappedLines(contact, 22, columnW, 0.55) : 0;
  const height = firstSize + restLines * restSize + (contactLines ? 12 + contactLines * 30 : 0);
  return { firstSize, restSize, height };
}
