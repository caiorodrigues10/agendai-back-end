/**
 * Máscaras para uso em LOGS e auditoria.
 *
 * Regras de privacidade (LGPD):
 * - NUNCA logar CPF completo nem nome completo em erro, log ou auditoria.
 * - Sempre mascarar: CPF mostra apenas 3 primeiros e 2 últimos dígitos;
 *   nome mostra apenas a primeira letra.
 *
 * Estas funções devem ser usadas sempre que um CPF ou nome precisar aparecer
 * em uma mensagem de log (ex.: mensagens de erro de cadastro, falhas de
 * integração, auditoria).
 */

/** Máscara de CPF para logs: "123.***.**-99". */
export function maskCpfForLogs(rawCpf: string | null | undefined): string {
  if (!rawCpf) return "";
  const d = rawCpf.replace(/\D/g, "");
  if (d.length !== 11) return "inválido";
  return `${d.slice(0, 3)}.***.**-${d.slice(9, 11)}`;
}

/** Máscara de nome para logs: "J***". */
export function maskNameForLogs(rawName: string | null | undefined): string {
  if (!rawName) return "";
  const trimmed = rawName.trim();
  if (trimmed.length === 0) return "";
  return `${trimmed[0]}${"*".repeat(Math.max(0, trimmed.length - 1))}`;
}
