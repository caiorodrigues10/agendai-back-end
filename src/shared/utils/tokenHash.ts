import { createHash } from "node:crypto";

/**
 * Hash SHA-256 usado para tokens de convite.
 * O token bruto NUNCA é persistido (nem em log, auditoria ou resposta) —
 * ele só existe no link enviado por e-mail.
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
