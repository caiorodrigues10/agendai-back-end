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
 * Duas palavras do meio são compatíveis se são iguais ou se uma é inicial
 * (1 letra) da outra. Ex.: "antonio" casa com "a"; "pedro" não casa com "carlos".
 */
function wordCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1 && b.startsWith(a)) return true;
  if (b.length === 1 && a.startsWith(b)) return true;
  return false;
}

/**
 * Compara dois nomes de forma tolerante:
 * - exige >= 2 palavras significativas em cada lado
 * - primeiro nome e último sobrenome iguais (ordem preservada)
 * - ignora preposições, acento, caixa e pontuação
 * - iniciais do nome do meio são toleradas: quando ambos têm nomes do meio,
 *   cada par posição-a-posição deve ser igual ou inicial compatível
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

  // Nomes do meio: quando ambos têm, cada par posição-a-posição deve ser
  // igual ou inicial compatível. Se apenas um tem, é tolerado (não comparado).
  const middleA = wordsA.slice(1, -1);
  const middleB = wordsB.slice(1, -1);
  if (middleA.length > 0 && middleB.length > 0) {
    const maxLen = Math.max(middleA.length, middleB.length);
    for (let i = 0; i < maxLen; i++) {
      if (!wordCompatible(middleA[i] ?? "", middleB[i] ?? "")) return false;
    }
  }

  return true;
}
