/**
 * Normalização e comparação tolerante de nomes próprios.
 *
 * Usada na verificação de correspondência CPF × nome: como diferentes fontes
 * podem gravar o mesmo nome de formas distintas (com/sem preposições, com
 * iniciais, com/sem acento), a comparação não pode ser exata.
 */

/** Preposições/artigos que são ignoradas na comparação de nomes. */
const NOISE_WORDS = new Set(["de", "da", "do", "dos", "das", "e"]);

/**
 * Remove acentos, coloca em minúsculas, descarta preposições e colapsa espaços.
 * Retorna as palavras significativas do nome, em ordem.
 */
export function normalizeNameWords(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/\./g, "") // remove pontos de iniciais (ex.: "J." -> "j")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !NOISE_WORDS.has(w));
}

/**
 * Uma palavra curta (inicial de 1 letra) corresponde a outra se essa outra
 * começa com a mesma letra. Ex.: "a" casa com "antonio".
 */
function wordMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1 && b.startsWith(a)) return true;
  if (b.length === 1 && a.startsWith(b)) return true;
  return false;
}

/**
 * Compara dois nomes de forma tolerante:
 * - ignora preposições (de, da, do, dos, das, e)
 * - ignora acento, caixa e pontuação
 * - aceita inicial de um lado como abreviação do nome completo do outro
 *
 * Retorna true quando os nomes se referem provavelmente à mesma pessoa.
 */
export function namesMatch(nameA: string | null | undefined, nameB: string | null | undefined): boolean {
  const wordsA = normalizeNameWords(nameA);
  const wordsB = normalizeNameWords(nameB);

  if (wordsA.length === 0 || wordsB.length === 0) return false;
  if (wordsA.length === wordsB.length && wordsA.every((w, i) => w === wordsB[i])) return true;

  // Comparação tolerante: cada palavra do lado menor deve encontrar uma
  // correspondência no lado maior (exata ou por inicial).
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];

  const used = new Array(longer.length).fill(false);
  for (const w of shorter) {
    let found = false;
    for (let i = 0; i < longer.length; i++) {
      if (!used[i] && wordMatches(w, longer[i])) {
        used[i] = true;
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}
