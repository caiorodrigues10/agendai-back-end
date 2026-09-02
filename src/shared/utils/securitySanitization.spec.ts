import { describe, expect, it } from "vitest";
import { buildSafeAuditDetails, sanitizeSensitiveText } from "./securitySanitization";

describe("securitySanitization", () => {
  it("never persists card, CVV, document, token or password values", () => {
    const details = buildSafeAuditDetails({
      planId: "plan-1",
      paymentMethod: "credit_card",
      creditCard: { number: "4111111111111111", ccv: "123" },
      cpf: "12345678909",
      password: "secret-value",
      token: "provider-token",
    });
    expect(details).toContain("plan-1");
    expect(details).not.toContain("4111111111111111");
    expect(details).not.toContain("12345678909");
    expect(details).not.toContain("secret-value");
    expect(details).not.toContain("provider-token");
  });

  it("redacts card numbers and bearer tokens from provider errors", () => {
    const sanitized = sanitizeSensitiveText(
      "cardNumber=4111111111111111 authorization=Bearer abc.def.ghi",
      500,
    );
    expect(sanitized).not.toContain("4111111111111111");
    expect(sanitized).not.toContain("abc.def.ghi");
    expect(sanitized).toContain("[REDACTED]");
  });

  it("redacts bare CPF and CNPJ values from provider errors", () => {
    const sanitized = sanitizeSensitiveText(
      "documentos recebidos: 12345678909 e 11222333000181",
      500,
    );
    expect(sanitized).not.toContain("12345678909");
    expect(sanitized).not.toContain("11222333000181");
  });
});
