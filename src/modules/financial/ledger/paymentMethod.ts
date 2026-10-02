/**
 * Normalização de forma de pagamento para o ledger/caixa.
 *
 * Valores brutos chegam em estilos diferentes conforme o fluxo:
 *   - conclusão de agenda/fila e vendas de produto: "cash" | "pix" | "credit_card" | "debit_card" | "fiado"
 *   - pacotes (enum PackagePaymentMethod): "cash" | "pix" | "card" | "other"
 *   - movimentos manuais do caixa: "CASH" | "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "FIADO"
 *
 * O ledger grava sempre o formato canônico em maiúsculas já usado pelo
 * fechamento do dia e pelo painel de caixa.
 */
export type LedgerPaymentMethod = "CASH" | "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "FIADO" | "OTHER";

export const LEDGER_PAYMENT_METHODS: LedgerPaymentMethod[] = [
  "CASH",
  "PIX",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "FIADO",
  "OTHER",
];

export function normalizePaymentMethod(raw?: string | null): LedgerPaymentMethod {
  if (!raw) return "OTHER";
  const value = raw.trim().toUpperCase().replace(/-/g, "_");

  switch (value) {
    case "CASH":
    case "DINHEIRO":
      return "CASH";
    case "PIX":
      return "PIX";
    case "CREDIT_CARD":
    case "CARTAO_CREDITO":
    case "CARTAO DE CREDITO":
    case "CREDITO":
    case "CARD":
    case "CARTAO":
      // "card" genérico (pacotes) entra como cartão — o fechamento soma
      // CREDIT_CARD e DEBIT_CARD no mesmo campo "cartão".
      return "CREDIT_CARD";
    case "DEBIT_CARD":
    case "CARTAO_DEBITO":
    case "CARTAO DE DEBITO":
    case "DEBITO":
      return "DEBIT_CARD";
    case "FIADO":
    case "A_PRAZO":
      return "FIADO";
    default:
      return "OTHER";
  }
}

/** Método gravado no model de origem (ex.: pagamento de fiado guarda o valor bruto). */
export function canonicalPaymentMethod(raw?: string | null): string {
  return normalizePaymentMethod(raw);
}
