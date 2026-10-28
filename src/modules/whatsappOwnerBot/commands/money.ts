/**
 * Formatação de dinheiro em pt-BR (R$).
 *
 * O app formata valores com `Intl.NumberFormat("pt-BR")` — o bot usa o mesmo
 * padrão para os números baterem com os das telas.
 */

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BRL_COMPACT = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "R$ 1.234,56" */
export function formatBRL(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "R$ 0,00";
  return BRL.format(amount);
}

/** "R$ 1.235" — para listas e relatórios (sem centavos). */
export function formatBRLShort(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "R$ 0";
  return BRL_COMPACT.format(amount);
}

/** Percentual com uma casa: "12,3%" */
export function formatPercent(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0%";
  return `${amount.toFixed(1).replace(".", ",")}%`;
}
