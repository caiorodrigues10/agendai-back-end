import { createHash } from "node:crypto";

/**
 * Computes a privacy-preserving identity key for active queue entries.
 * A phone is combined with the name so two people sharing a phone remain
 * separate. Without a valid phone, only the public session is reliable.
 */
export function computeIdentityKey(phone: string, name: string, sessionId: string): string {
  const normalizedPhone = phone.replace(/\D/g, '');
  const normalizedName = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const source = normalizedPhone.length >= 10 && normalizedPhone.length <= 11
    ? `phone:${normalizedPhone}:${normalizedName}`
    : `session:${sessionId}`;
  return createHash("sha256").update(source).digest("hex");
}
