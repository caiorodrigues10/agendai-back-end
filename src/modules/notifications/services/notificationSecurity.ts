import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { AppError } from "@/shared/errors/AppError";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

type Keyring = Record<string, string>;

function readKeyring(): { activeVersion: string; keys: Map<string, Buffer> } {
  const testing = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
  const raw = process.env.NOTIFICATION_PAYLOAD_KEYS?.trim();
  const activeVersion = process.env.NOTIFICATION_PAYLOAD_ACTIVE_KEY?.trim() || "test-v1";
  let parsed: Keyring;

  if (!raw && testing) {
    parsed = { "test-v1": TEST_KEY };
  } else if (!raw) {
    throw new AppError(
      "Criptografia da fila de notificações não configurada.",
      503,
      undefined,
      "NOTIFICATION_ENCRYPTION_NOT_CONFIGURED",
    );
  } else {
    try {
      parsed = JSON.parse(raw) as Keyring;
    } catch {
      throw new AppError(
        "NOTIFICATION_PAYLOAD_KEYS possui formato inválido.",
        503,
        undefined,
        "NOTIFICATION_ENCRYPTION_INVALID",
      );
    }
  }

  const keys = new Map<string, Buffer>();
  for (const [version, encoded] of Object.entries(parsed)) {
    const key = Buffer.from(encoded, "base64");
    if (!version.trim() || key.length !== 32) {
      throw new AppError(
        "Cada chave de notificação deve possuir 32 bytes em Base64.",
        503,
        undefined,
        "NOTIFICATION_ENCRYPTION_INVALID",
      );
    }
    keys.set(version, key);
  }
  if (!keys.has(activeVersion)) {
    throw new AppError(
      "A chave ativa de notificação não existe no keyring.",
      503,
      undefined,
      "NOTIFICATION_ENCRYPTION_INVALID",
    );
  }
  return { activeVersion, keys };
}

function hashKey(): Buffer {
  const testing = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
  const raw = process.env.NOTIFICATION_HASH_KEY?.trim();
  if (!raw && testing) return Buffer.from(TEST_KEY, "base64");
  if (!raw) {
    throw new AppError(
      "Hash seguro de notificações não configurado.",
      503,
      undefined,
      "NOTIFICATION_HASH_NOT_CONFIGURED",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new AppError(
      "NOTIFICATION_HASH_KEY deve possuir 32 bytes em Base64.",
      503,
      undefined,
      "NOTIFICATION_HASH_INVALID",
    );
  }
  return key;
}

export interface EncryptedNotificationPayload {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: string;
}

export function encryptNotificationPayload(
  payload: Record<string, unknown>,
): EncryptedNotificationPayload {
  const { activeVersion, keys } = readKeyring();
  const key = keys.get(activeVersion)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: activeVersion,
  };
}

export function decryptNotificationPayload<T extends Record<string, unknown>>(
  encrypted: EncryptedNotificationPayload,
): T {
  const { keys } = readKeyring();
  const key = keys.get(encrypted.keyVersion);
  if (!key) {
    throw new AppError(
      "Chave histórica da notificação não está disponível.",
      503,
      undefined,
      "NOTIFICATION_KEY_VERSION_MISSING",
    );
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(encrypted.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Payload da notificação não pôde ser autenticado.",
      500,
      undefined,
      "NOTIFICATION_PAYLOAD_INVALID",
    );
  }
}

export function normalizeDestination(channel: "EMAIL" | "WHATSAPP", value: string): string {
  if (channel === "EMAIL") return value.trim().toLowerCase();
  const digits = value.replace(/\D/g, "");
  return digits.length <= 11 ? `55${digits}` : digits;
}

export function hashNotificationDestination(normalized: string): string {
  return createHmac("sha256", hashKey()).update(normalized).digest("hex");
}

export function hashNotificationContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.trim().split("@");
  if (!domain) return "***";
  const shown = local.slice(0, Math.min(2, local.length));
  return `${shown}${"*".repeat(Math.max(3, local.length - shown.length))}@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

export function maskDestination(channel: "EMAIL" | "WHATSAPP", value: string): string {
  return channel === "EMAIL" ? maskEmail(value) : maskPhone(value);
}

export function sanitizeNotificationError(error: unknown): {
  code: string;
  message: string;
} {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = String(candidate?.code ?? "PROVIDER_ERROR")
    .replace(/[^A-Za-z0-9_.-]/g, "_")
    .slice(0, 100);
  const original = String(candidate?.message ?? "Falha temporária no provedor");
  const message = original
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:\d[ -]*?){11,19}\b/g, "[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .slice(0, 500);
  return { code, message };
}

export function assertNotificationCryptoConfigured(): void {
  readKeyring();
  hashKey();
}
