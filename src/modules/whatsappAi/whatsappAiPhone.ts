import { normalizeWhatsAppPhone } from "@/shared/services/evolutionApiService";

/**
 * Telefone do cliente no WhatsApp.
 *
 * O banco guarda o telefone de três formas diferentes (55 + número, DDD +
 * número e só dígitos), dependendo de onde o cadastro foi feito. Para não
 * depender de qual delas foi usada, toda busca por telefone considera as
 * variantes — e o valor gravado é sempre o canônico (55 + número).
 */

/** Tamanho máximo das colunas `phone` (VarChar 20). */
export const AI_PHONE_MAX_LENGTH = 20;

/** Telefone canônico: só dígitos, com DDI 55 quando o número é brasileiro curto. */
export function canonicalAiPhone(raw: string | null | undefined): string {
  return normalizeWhatsAppPhone(raw ?? "");
}

/**
 * Variantes do mesmo telefone para consulta no banco.
 *
 * `5511999999999` (canônico) e `11999999999` (sem DDI) apontam para a mesma
 * pessoa. O DDI 55 só é removido quando o resto tem 10 ou 11 dígitos — o
 * que descarta números internacionais que começam com 55 por acaso.
 */
export function aiPhoneCandidates(raw: string | null | undefined): string[] {
  const canonical = canonicalAiPhone(raw);
  if (!canonical) return [];

  const candidates = new Set<string>([canonical]);

  const withoutCountryCode = canonical.startsWith("55") ? canonical.slice(2) : "";
  if (withoutCountryCode.length >= 10 && withoutCountryCode.length <= 11) {
    candidates.add(withoutCountryCode);
  }

  const rawDigits = (raw ?? "").replace(/\D/g, "");
  if (rawDigits && rawDigits !== canonical) candidates.add(rawDigits);

  return [...candidates];
}

/** Telefone mascarado para log/auditoria (nunca o número completo). */
export function maskAiPhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `(***) *****-${digits.slice(-4)}`;
}
