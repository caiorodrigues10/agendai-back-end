import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY não configurada (64 hex chars)");
  }
  return Buffer.from(raw, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivHex, authTagHex, encrypted] = ciphertext.split(":");
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error("Formato de texto criptografado inválido");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function encryptObject(obj: Record<string, unknown>): string {
  return encrypt(JSON.stringify(obj));
}

export function decryptObject<T = Record<string, unknown>>(ciphertext: string): T {
  return JSON.parse(decrypt(ciphertext)) as T;
}

export function maskCredentials(obj: Record<string, unknown>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const key of Object.keys(obj)) {
    const val = String(obj[key]);
    if (val.length <= 8) {
      masked[key] = "••••••••";
    } else {
      masked[key] = val.slice(0, 4) + "•••" + val.slice(-4);
    }
  }
  return masked;
}
