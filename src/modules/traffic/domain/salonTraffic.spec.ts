/// <reference types="vitest/globals" />
import {
  SALON_IDENTIFIER_MAX_LENGTH,
  deriveSalonSection,
  isValidSalonIdentifier,
  isUuidSalonIdentifier,
  matchesSalonIdentifierType,
  sanitizeSalonTrafficTab,
  salonTargetKey,
} from "./salonTraffic";

const UUID = "0f9d4a1c-6f6f-4d0e-9d1e-2b7a5c8e1f33";

describe("salonTraffic (domínio)", () => {
  it("aceita o identificador público no charset do contrato", () => {
    expect(isValidSalonIdentifier("acme-barbearia")).toBe(true);
    expect(isValidSalonIdentifier(UUID)).toBe(true);
    expect(isValidSalonIdentifier("A1")).toBe(true);

    expect(isValidSalonIdentifier("")).toBe(false);
    expect(isValidSalonIdentifier("acme barbearia")).toBe(false);
    expect(isValidSalonIdentifier("acme_barbearia")).toBe(false);
    expect(isValidSalonIdentifier("acme/barbearia")).toBe(false);
    expect(isValidSalonIdentifier("a".repeat(SALON_IDENTIFIER_MAX_LENGTH + 1))).toBe(false);
    expect(isValidSalonIdentifier(123)).toBe(false);
  });

  it("distingue a forma do identificador (UUID × slug)", () => {
    expect(isUuidSalonIdentifier(UUID)).toBe(true);
    expect(isUuidSalonIdentifier("acme-barbearia")).toBe(false);

    expect(matchesSalonIdentifierType(UUID, "id")).toBe(true);
    expect(matchesSalonIdentifierType(UUID, "slug")).toBe(false);
    expect(matchesSalonIdentifierType("acme-barbearia", "slug")).toBe(true);
    expect(matchesSalonIdentifierType("acme-barbearia", "id")).toBe(false);
  });

  it("trata tab fora da allowlist como ausente", () => {
    expect(sanitizeSalonTrafficTab("queue")).toBe("queue");
    expect(sanitizeSalonTrafficTab("appointments")).toBe("appointments");
    expect(sanitizeSalonTrafficTab("profile")).toBe("profile");

    expect(sanitizeSalonTrafficTab("admin")).toBeUndefined();
    expect(sanitizeSalonTrafficTab("")).toBeUndefined();
    expect(sanitizeSalonTrafficTab(null)).toBeUndefined();
    expect(sanitizeSalonTrafficTab(7)).toBeUndefined();
  });

  it("deriva a seção da página pública pela rota e pela aba", () => {
    expect(deriveSalonSection("/queue/:id")).toBe("queue");
    expect(deriveSalonSection("/queue/:id", "queue")).toBe("queue");
    expect(deriveSalonSection("/queue/:id", "profile")).toBe("profile");
    expect(deriveSalonSection("/queue/:id", "appointments")).toBe("appointments");
    expect(deriveSalonSection("/queue/:id/produtos/:productId")).toBe("products");
    expect(deriveSalonSection("/s/:slug")).toBe("profile");
  });

  it("separa o alvo de salão do alvo de organização", () => {
    expect(salonTargetKey("barbershop", UUID)).toBe(`b:${UUID}`);
    expect(salonTargetKey("organization", UUID)).toBe(`o:${UUID}`);
  });
});
