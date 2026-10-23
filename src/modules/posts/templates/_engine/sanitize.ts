/**
 * Sanitização de texto do usuário antes do render.
 *
 * Remove caracteres sem glifo nas fontes do motor (emojis, CJK, controle),
 * normaliza espaços e aplica limite. Devolve `dropped`/`truncated` (contrato
 * do aviso no editor) e `removed` para avisar que algo foi descartado (nada
 * de tofu no PNG final).
 *
 * O espelho no front é `frontend/src/features/posts/renderTextGlyphs.ts` e o
 * contrato compartilhado dos dois lados está em `glyphFixtures.json`
 * (testado por `sanitize.spec.ts` aqui e por `renderTextGlyphs.test.ts` lá).
 */

// Cobertura das fontes Montserrat/Inter: Latin básico + Latin-1 Supplement
// (acentos pt-BR) + pontuação tipográfica comum. Todo o resto é removido.
const KEEP =
  // eslint-disable-next-line no-control-regex
  /[A-Za-zÀ-ÖØ-öø-ÿ0-9\s.,;:!?'"()\-–—/+@#%&*°ºª$R€£]/gu;
// Nota: "R$" entra como 'R' + '$' (ambos ASCII). Emoji (U+1F300+), CJK (U+4E00+),
// VS16 (U+FE0F) e similares ficam fora do KEEP e são descartados.

/** Mesmo alfabeto sem `\s` — para decidir se um GRAFEMA inteiro tem glifo. */
const KEEP_ONE = /[A-Za-zÀ-ÖØ-öø-ÿ0-9.,;:!?'"()\-–—/+@#%&*°ºª$R€£]/u;

export type SanitizeResult = {
  text: string;
  removed: boolean;
  /** Grafemas (emoji+CJK+combinantes…) descartados, únicos e na ordem digitada. */
  dropped: string[];
  /** O texto limpo passou de `max` e foi cortado (fronteira de palavra). */
  truncated: boolean;
};

function graphemes(raw: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(raw), (s) => s.segment);
  }
  return Array.from(raw);
}

/**
 * Grafemas que perderam algum code point na limpeza (mesma régua do front:
 * o grafema só é mantido se TODOS os seus code points têm glifo).
 */
function droppedGraphemes(original: string): string[] {
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const unit of graphemes(original)) {
    if (!unit.trim()) continue; // espaço normalizado não é caractere perdido
    if (Array.from(unit).every((ch) => KEEP_ONE.test(ch))) continue;
    if (seen.has(unit)) continue;
    seen.add(unit);
    dropped.push(unit);
  }
  return dropped;
}

/**
 * @param raw texto livre (título, nome de serviço, CTA…)
 * @param max limite de caracteres (após limpeza)
 */
export function sanitizeText(raw: string | null | undefined, max = 100): SanitizeResult {
  if (!raw) return { text: "", removed: false, dropped: [], truncated: false };
  const original = String(raw);
  const dropped = droppedGraphemes(original);
  // 1) mantém só caracteres com glifo
  let text = (original.match(KEEP) || []).join("");
  // 2) normaliza espaços (colapsa + trim)
  text = text.replace(/\s+/g, " ").trim();
  // 3) aplica limite SEM cortar no meio de palavra (corta na última fronteira)
  const truncated = text.length > max;
  if (truncated) {
    const cut = text.slice(0, max);
    const lastSpace = cut.lastIndexOf(" ");
    text = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
  }
  const removed = text !== original.replace(/\s+/g, " ").trim();
  return { text, removed, dropped, truncated };
}

/** Sanitiza vários campos de uma vez; `removed` se algum mudou. */
export function sanitizeFields<T extends Record<string, string | null | undefined>>(
  fields: T,
  limits: Partial<Record<keyof T, number>> = {}
): { values: Record<keyof T, string>; removed: boolean; removedKeys: (keyof T)[] } {
  const values = {} as Record<keyof T, string>;
  const removedKeys: (keyof T)[] = [];
  for (const key of Object.keys(fields) as (keyof T)[]) {
    const r = sanitizeText(fields[key], limits[key] ?? 100);
    values[key] = r.text;
    if (r.removed) removedKeys.push(key);
  }
  return { values, removed: removedKeys.length > 0, removedKeys };
}
