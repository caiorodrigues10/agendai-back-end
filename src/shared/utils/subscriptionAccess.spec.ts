import { describe, expect, it } from "vitest";
import { subscriptionGrantsAccess } from "@/shared/utils/subscriptionAccess";

describe("subscriptionGrantsAccess", () => {
  const now = new Date("2026-08-22T12:00:00Z");
  const trialEnd = new Date("2026-09-20T12:00:00Z");

  it("bloqueia trial calendário sem cartão", () => {
    const r = subscriptionGrantsAccess(null, now, trialEnd);
    expect(r).toEqual({ allowed: false, cardRequired: true });
  });

  it("libera TRIALING com token vaulted dentro do trial", () => {
    const r = subscriptionGrantsAccess(
      {
        status: "TRIALING",
        endDate: trialEnd,
        asaasCreditCardToken: "tok_abc",
      },
      now,
      trialEnd
    );
    expect(r.allowed).toBe(true);
  });

  it("bloqueia TRIALING sem token", () => {
    const r = subscriptionGrantsAccess(
      { status: "TRIALING", endDate: trialEnd, asaasCreditCardToken: null },
      now,
      trialEnd
    );
    expect(r).toEqual({ allowed: false, cardRequired: true });
  });

  it("libera ACTIVE sem exigir token Asaas", () => {
    const r = subscriptionGrantsAccess(
      { status: "ACTIVE", endDate: null, asaasCreditCardToken: null },
      now,
      trialEnd
    );
    expect(r.allowed).toBe(true);
  });

  it("bloqueia TRIALING após fim do trial", () => {
    const after = new Date("2026-09-21T12:00:00Z");
    const r = subscriptionGrantsAccess(
      {
        status: "TRIALING",
        endDate: trialEnd,
        asaasCreditCardToken: "tok_abc",
      },
      after,
      trialEnd
    );
    expect(r.allowed).toBe(false);
    expect(r.cardRequired).toBe(false);
  });
});
