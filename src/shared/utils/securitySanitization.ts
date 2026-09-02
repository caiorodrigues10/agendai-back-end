const AUDIT_VALUE_ALLOWLIST = new Set([
  "barbershopId",
  "planId",
  "paymentMethod",
  "asaasBillingType",
  "serviceId",
  "appointmentId",
  "queueItemId",
  "clientId",
  "targetId",
  "status",
  "segment",
  "format",
]);

const SENSITIVE_KEY = /password|secret|token|authorization|cookie|credit.?card|card.?number|number|ccv|cvv|cpf|cnpj|tax.?id|document|recaptcha/i;

export function buildSafeAuditDetails(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const input = body as Record<string, unknown>;
  const safeValues: Record<string, string | number | boolean | null> = {};
  const changedFields: string[] = [];

  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(key)) continue;
    changedFields.push(key);
    if (
      AUDIT_VALUE_ALLOWLIST.has(key) &&
      (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null)
    ) {
      safeValues[key] = value;
    }
  }

  if (!changedFields.length && !Object.keys(safeValues).length) return null;
  return JSON.stringify({ fields: changedFields.sort(), values: safeValues });
}

export function sanitizeSensitiveText(value: unknown, maxLength: number): string | null {
  if (value == null) return null;
  let text = String(value);

  text = text
    .replace(/(authorization"?\s*[:=]\s*)"?Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "$1[REDACTED]")
    .replace(/("?(?:password|secret|token|authorization|cookie|creditCard|cardNumber|number|ccv|cvv|cpf|cnpj)"?\s*[:=]\s*)"?[^",}\s]+/gi, "$1[REDACTED]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_CARD]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]");

  return text.substring(0, maxLength);
}
