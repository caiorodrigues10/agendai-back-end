import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Código de vínculo do assistente de WhatsApp.
 *
 * - 6 caracteres alfanuméricos (sem 0/O, 1/I — evita confusão ao digitar)
 * - 10 minutos de validade, uso único, máximo de 5 tentativas
 * - o banco guarda apenas o HMAC do código (nunca o código em texto puro)
 */

export const OWNER_BOT_LINK_CODE_LENGTH = 6;
export const OWNER_BOT_LINK_CODE_TTL_MINUTES = 10;
export const OWNER_BOT_LINK_CODE_MAX_ATTEMPTS = 5;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function codeSecret(): string {
  return (
    process.env.OWNER_BOT_LINK_SECRET?.trim() ||
    process.env.EVOLUTION_API_KEY?.trim() ||
    "owner-bot-dev-secret"
  );
}

/** Gera um código aleatório de 6 caracteres. */
export function generateOwnerBotLinkCode(): string {
  let code = "";
  for (let index = 0; index < OWNER_BOT_LINK_CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}

/** HMAC-SHA256 do código — o valor gravado no banco. */
export function hashOwnerBotLinkCode(code: string): string {
  return createHmac("sha256", codeSecret()).update(code.trim().toUpperCase()).digest("hex");
}

/** Comparação em tempo constante entre o código informado e o hash gravado. */
export function verifyOwnerBotLinkCode(code: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashOwnerBotLinkCode(code), "utf8");
  const stored = Buffer.from(storedHash ?? "", "utf8");
  if (candidate.length !== stored.length || stored.length === 0) return false;
  return timingSafeEqual(candidate, stored);
}
