/**
 * Leitura de texto numérico vindo de planilha.
 *
 * O Excel (e os sistemas que exportam para Excel) às vezes entrega o número
 * em **notação científica** — inclusive telefone e CPF. Os dígitos dessa
 * forma são **outros**: `1,23456789E+10` vira "12345678910", que tem 11
 * dígitos e parece um telefone válido, mas não é o número do cliente.
 *
 * Por isso um valor assim nunca vira identidade: a linha é rejeitada.
 */
export function looksScientificNotation(value: string): boolean {
  return /^[+-]?\d+([.,]\d+)?[eE][+-]?\d+$/.test(String(value ?? "").trim());
}
