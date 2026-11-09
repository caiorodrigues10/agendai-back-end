import { describe, expect, it } from "vitest";
import {
  activePackageWhere,
  isPackageActive,
} from "./clientPackageActive";

const SHOP = "00000000-0000-4000-8000-000000000001";
const OTHER_SHOP = "00000000-0000-4000-8000-000000000002";
const NOW_MS = Date.parse("2026-11-04T12:00:00.000Z");

function pkg(overrides: Partial<Parameters<typeof isPackageActive>[0]> = {}) {
  return {
    status: "ACTIVE",
    remainingSessions: 3,
    expiresAt: null,
    ...overrides,
  };
}

describe("modules/clients — isPackageActive", () => {
  it("ACTIVE com sessões restantes e sem expiração: conta", () => {
    expect(isPackageActive(pkg(), NOW_MS)).toBe(true);
  });

  it("ACTIVE com expiresAt nulo: conta (pacote sem validade)", () => {
    expect(isPackageActive(pkg({ expiresAt: null }), NOW_MS)).toBe(true);
  });

  it("ACTIVE com expiresAt no futuro: conta", () => {
    const expiresAt = new Date(NOW_MS + 60_000);
    expect(isPackageActive(pkg({ expiresAt }), NOW_MS)).toBe(true);
  });

  it("ACTIVE vencido (expiresAt <= agora): não conta", () => {
    const expiresAt = new Date(NOW_MS - 60_000);
    expect(isPackageActive(pkg({ expiresAt }), NOW_MS)).toBe(false);
  });

  it("ACTIVE com expiresAt exatamente igual ao agora: não conta (mesma regra do consumo de créditos)", () => {
    const expiresAt = new Date(NOW_MS);
    expect(isPackageActive(pkg({ expiresAt }), NOW_MS)).toBe(false);
  });

  it("ACTIVE sem sessões restantes (remainingSessions = 0): não conta", () => {
    expect(isPackageActive(pkg({ remainingSessions: 0 }), NOW_MS)).toBe(false);
  });

  it("ACTIVE sem sessões restantes e negativo: não conta", () => {
    expect(isPackageActive(pkg({ remainingSessions: -1 }), NOW_MS)).toBe(false);
  });

  it("status diferente de ACTIVE: não conta, mesmo com sessões e validade", () => {
    expect(isPackageActive(pkg({ status: "DEPLETED" }), NOW_MS)).toBe(false);
    expect(isPackageActive(pkg({ status: "EXPIRED" }), NOW_MS)).toBe(false);
    expect(isPackageActive(pkg({ status: "CANCELLED" }), NOW_MS)).toBe(false);
  });

  it("usa Date.now() como referência padrão de agora", () => {
    const expiresAt = new Date(Date.now() - 1000);
    expect(isPackageActive(pkg({ expiresAt }))).toBe(false);
  });
});

describe("modules/clients — activePackageWhere", () => {
  it("leva o barbershopId do contexto para dentro do filtro do pacote", () => {
    const where = activePackageWhere(SHOP, NOW_MS);

    expect(where.barbershopId).toBe(SHOP);
    expect(where.barbershopId).not.toBe(OTHER_SHOP);
  });

  it("exige status ACTIVE e sessões restantes", () => {
    const where = activePackageWhere(SHOP, NOW_MS);

    expect(where.status).toBe("ACTIVE");
    expect(where.remainingSessions).toEqual({ gt: 0 });
  });

  it("validade: expiresAt nulo OU expiresAt estritamente maior que agora", () => {
    const where = activePackageWhere(SHOP, NOW_MS);

    expect(where.OR).toEqual([
      { expiresAt: null },
      { expiresAt: { gt: new Date(NOW_MS) } },
    ]);
  });

  it("o operador é estritamente maior (gt), coerente com expiresAt <= agora = vencido", () => {
    const where = activePackageWhere(SHOP, NOW_MS);
    const gt = (where.OR as Array<Record<string, unknown>>)[1] as {
      expiresAt: { gt: Date };
    };

    // mesmo instante está vencido → não pode satisfazer o `gt`
    expect(gt.expiresAt.gt.getTime()).toBe(NOW_MS);
    expect(gt.expiresAt.gt.getTime() > NOW_MS).toBe(false);
  });
});
