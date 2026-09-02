import type { PaymentProvider } from "../dtos/IPaymentDTO";

const SAFE_KEYS = new Set([
  "id",
  "publicId",
  "refundPublicId",
  "status",
  "status_detail",
  "billingType",
  "payment_method_id",
  "payment_type_id",
  "transaction_amount",
  "paidAmount",
  "currency_id",
  "description",
  "external_reference",
  "externalId",
  "date_created",
  "date_last_updated",
  "date_of_expiration",
  "dueDate",
  "confirmedDate",
  "paymentDate",
  "clientPaymentDate",
  "invoiceUrl",
  "checkoutUrl",
  "action",
  "type",
  "event",
  "live_mode",
  "devMode",
]);

function parsePayload(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function allowlist(value: unknown, depth = 0): unknown {
  if (depth > 3 || value === null || value === undefined) return null;
  if (["string", "number", "boolean"].includes(typeof value)) {
    return typeof value === "string" ? value.slice(0, 500) : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => allowlist(item, depth + 1));
  if (typeof value !== "object") return null;

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!SAFE_KEYS.has(key)) continue;
    const safe = allowlist(child, depth + 1);
    if (safe !== null) result[key] = safe;
  }
  return result;
}

/**
 * Snapshot para suporte e conciliação. Nunca inclui pagador, documento,
 * token, cartão, QR Code, headers ou corpo integral do provedor.
 */
export function buildPaymentProviderSnapshot(
  provider: PaymentProvider,
  raw: unknown,
): Record<string, unknown> {
  const safe = allowlist(parsePayload(raw));
  return {
    provider,
    capturedAt: new Date().toISOString(),
    data: safe && typeof safe === "object" ? safe : {},
  };
}

