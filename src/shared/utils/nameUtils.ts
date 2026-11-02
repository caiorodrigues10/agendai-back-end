/**
 * Normalização e comparação tolerante de nomes próprios.
 *
 * Usada na verificação de correspondência CPF × nome: como diferentes fontes
 * podem gravar o mesmo nome de formas distintas (com/sem preposições, com
 * iniciais, com/sem acento), a comparação não pode ser exata.
 *
 * Regra de igualdade tolerante:
 *  - Exige pelo menos 2 palavras significativas em cada lado (nomes de uma
 *    única palavra nunca batem contra nomes compostos).
 *  - Primeiro nome e último sobrenome devem coincidir (ordem preservada).
 *  - Ignora preposições (de, da, do, dos, das, e), acento, caixa e pontuação.
 *  - Iniciais do nome do meio são toleradas (não são comparadas).
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
 * Compara dois nomes de forma tolerante:
 * - exige >= 2 palavras significativas em cada lado
 * - primeiro nome e último sobrenome iguais (ordem preservada)
 * - ignora preposições, acento, caixa e pontuação
 * - iniciais do nome do meio são toleradas (não comparadas)
 *
 * Retorna true quando os nomes se referem provavelmente à mesma pessoa.
 */
export function namesMatch(nameA: string | null | undefined, nameB: string | null | undefined): boolean {
  const wordsA = normalizeNameWords(nameA);
  const wordsB = normalizeNameWords(nameB);

  // Exige pelo menos 2 palavras significativas em cada lado.
  if (wordsA.length < 2 || wordsB.length < 2) return false;

  // Primeiro nome e último sobrenome devem coincidir (ordem preservada).
  if (wordsA[0] !== wordsB[0]) return false;
  if (wordsA[wordsA.length - 1] !== wordsB[wordsB.length - 1]) return false;

  return true;
}
