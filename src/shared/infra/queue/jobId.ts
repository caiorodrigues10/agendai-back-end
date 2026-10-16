/**
 * Converte a chave de domínio de deduplicação em um jobId aceito pelo BullMQ.
 *
 * O BullMQ (v6) rejeita jobId custom contendo ":" fora do formato repetível
 * `prefix:name:id` (exatamente 3 partes) com "Custom Id cannot contain :".
 * As chaves de dedup usam ":" como separador (`verify-email:<uuid>`,
 * `welcome:<uuid>`, `call:<id>`), o que derrubava o `queue.add()` inteiro e
 * descartava silenciosamente e-mails de verificação/boas-vindas.
 *
 * Trocamos o separador por "-", preservando unicidade e sem alterar o formato
 * das chaves usadas pelo domínio.
 */
export function toBullJobId(deduplicationKey?: string): string | undefined {
  return deduplicationKey ? deduplicationKey.replace(/:/g, "-") : undefined;
}
