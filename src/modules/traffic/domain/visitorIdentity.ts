import { createHmac } from "node:crypto";

/**
 * Identidade efêmera de visitante.
 *
 * O IP nunca é gravado no Redis nem no banco. O HMAC usa um salt aleatório por
 * dia civil: o mesmo IP em dias diferentes produz hashes diferentes e o hash
 * não permite recuperar o IP sem o salt. A origem da identidade é o
 * `request.ip` já resolvido pelo Fastify conforme `TRUST_PROXY`.
 */

/** HMAC hexadecimal de 256 bits para um IP e user-agent. */
export function visitorHash(salt: string, ip: string, userAgent: string): string {
  return createHmac("sha256", salt)
    .update(ip.trim())
    .update("\u0000")
    .update(userAgent.trim())
    .digest("hex");
}

/**
 * Hash de uso exclusivamente local para a cota por IP. O salt vive apenas no
 * processo: mesmo depois de um restart, o valor do bucket não pode ser ligado
 * ao IP original nem sobreviver no Redis.
 */
export function ephemeralHash(salt: string, ip: string): string {
  return createHmac("sha256", salt).update(ip.trim()).digest("hex");
}
