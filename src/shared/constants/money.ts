/**
 * Limite monetário padrão para valores digitados em rotas financeiras.
 *
 * Motivo: sem teto, um `finalPrice`/`amount` gigante (ex.: 1e15) estoura o
 * `Decimal(12,2)` de `cash_movements` (limite 10^10) e devolve 500 — ou, com a
 * atomicidade corrigida, é simplesmente rejeitado. Um único salão não opera
 * atendimento/acima disso; R$ 100.000 é um teto generoso e explícito.
 */
export const MAX_MONETARY_VALUE = 100_000;

/** Mensagem padrão 400 para valor acima do teto. */
export const MONETARY_VALUE_TOO_HIGH =
  `Valor acima do limite permitido (máximo R$ ${MAX_MONETARY_VALUE.toLocaleString("pt-BR")})`;
