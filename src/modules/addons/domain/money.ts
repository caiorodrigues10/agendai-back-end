/**
 * Money helpers — API/banco usam reais (número); o domínio calcula em
 * centavos inteiros para não herdar erro de ponto flutuante
 * (0.1 + 0.2 → 0.30000000000000004 em reais; 10 + 20 = 30 centavos).
 */

/** Converte reais (número de API) para centavos inteiros. Arredonda no centavo. */
export function toCents(reais: number): number {
  if (!Number.isFinite(reais)) {
    throw new Error(`Invalid monetary value: ${reais}`);
  }
  return Math.round(reais * 100);
}

/** Converte centavos inteiros de volta para reais (API/JSON). */
export function toReais(cents: number): number {
  if (!Number.isInteger(cents)) {
    throw new Error(`Cents must be an integer: ${cents}`);
  }
  return cents / 100;
}
