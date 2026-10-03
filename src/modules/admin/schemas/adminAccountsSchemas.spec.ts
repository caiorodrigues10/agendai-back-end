import { describe, it, expect } from "vitest";
import {
  adminAccountIdParamsSchema,
  adminAccountReasonSchema,
  adminAccountExtendTrialSchema,
  adminAccountChangePlanSchema,
} from "./adminAccountsSchemas";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("adminAccountsSchemas — ações de controle de conta", () => {
  it("reason: exige no mínimo 10 caracteres", () => {
    expect(adminAccountReasonSchema.safeParse({ reason: "curto" }).success).toBe(false);
    expect(adminAccountReasonSchema.safeParse({ reason: "1234567890" }).success).toBe(true);
  });

  it("reason: aplica trim antes de validar", () => {
    const parsed = adminAccountReasonSchema.parse({ reason: "   motivo válido aqui   " });
    expect(parsed.reason).toBe("motivo válido aqui");
  });

  it("reason: rejeita chaves desconhecidas (.strict)", () => {
    expect(
      adminAccountReasonSchema.safeParse({ reason: "motivo válido", extra: "x" }).success,
    ).toBe(false);
  });

  it("extend-trial: days inteiro entre 1 e 90", () => {
    const base = { reason: "motivo válido aqui" };
    expect(adminAccountExtendTrialSchema.safeParse({ ...base, days: 0 }).success).toBe(false);
    expect(adminAccountExtendTrialSchema.safeParse({ ...base, days: 91 }).success).toBe(false);
    expect(adminAccountExtendTrialSchema.safeParse({ ...base, days: 7.5 }).success).toBe(false);
    expect(adminAccountExtendTrialSchema.safeParse({ ...base, days: 7 }).success).toBe(true);
  });

  it("change-plan: exige planId uuid válido", () => {
    const base = { reason: "motivo válido aqui" };
    expect(adminAccountChangePlanSchema.safeParse({ ...base, planId: "abc" }).success).toBe(false);
    expect(adminAccountChangePlanSchema.safeParse({ ...base, planId: VALID_UUID }).success).toBe(true);
  });

  it("params: exige uuid", () => {
    expect(adminAccountIdParamsSchema.safeParse({ id: "nope" }).success).toBe(false);
    expect(adminAccountIdParamsSchema.safeParse({ id: VALID_UUID }).success).toBe(true);
  });
});
