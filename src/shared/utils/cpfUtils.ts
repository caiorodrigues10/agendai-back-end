/**
 * Utilitários de CPF
 * - Valida formato e dígitos verificadores (algoritmo oficial da Receita Federal)
 * - Normaliza (remove máscara)
 * - Mascara para exibição
 */

/** Remove tudo que não for dígito */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

/** 000.000.000-00 */
export function maskCpf(cpf: string): string {
  const d = normalizeCpf(cpf);
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

/**
 * Valida CPF pela regra dos dígitos verificadores.
 * Aceita com ou sem máscara.
 * Rejeita sequências repetidas (111.111.111-11, etc.).
 */
export function isValidCpf(raw: string): boolean {
  const cpf = normalizeCpf(raw);

  if (cpf.length !== 11) return false;

  // Rejeita sequências idênticas
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  // Primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf[9])) return false;

  // Segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf[10])) return false;

  return true;
}