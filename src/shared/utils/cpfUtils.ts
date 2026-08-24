/**
 * Utilitários de CPF/CNPJ
 * - Valida formato e dígitos verificadores (algoritmo oficial da Receita Federal)
 * - Normaliza (remove máscara)
 * - Mascara para exibição
 */

/** Remove tudo que não for dígito */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

/** Remove tudo que não for dígito */
export function normalizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

/** 000.000.000-00 */
export function maskCpf(cpf: string): string {
  const d = normalizeCpf(cpf);
  return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

/** 00.000.000/0000-00 */
export function maskCnpj(cnpj: string): string {
  const d = normalizeCnpj(cnpj);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
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

/**
 * Valida CNPJ pela regra dos dígitos verificadores.
 * Aceita com ou sem máscara.
 * Rejeita sequências repetidas.
 */
export function isValidCnpj(raw: string): boolean {
  const cnpj = normalizeCnpj(raw);

  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base: string, weights: number[]): number => {
    const sum = weights.reduce((acc, w, i) => acc + parseInt(base[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const d1 = calcDigit(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== parseInt(cnpj[12])) return false;
  const d2 = calcDigit(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === parseInt(cnpj[13]);
}