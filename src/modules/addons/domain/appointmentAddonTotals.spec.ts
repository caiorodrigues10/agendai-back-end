import { describe, expect, it } from "vitest";
import { toCents, toReais } from "./money";
import {
  appointmentTotal,
  commissionBase,
  totalDurationMinutes,
} from "./appointmentAddonTotals";
import type { AddonSnapshot } from "./addonTypes";

function snap(overrides: Partial<AddonSnapshot> = {}): AddonSnapshot {
  return {
    addonId: "a1",
    name: "Addon",
    unitPriceCents: 1000,
    quantity: 1,
    durationMinutes: 15,
    commissionable: true,
    ...overrides,
  };
}

describe("money — reais ↔ centavos", () => {
  it("convertes valores exatos sem drift de float", () => {
    expect(toCents(0)).toBe(0);
    expect(toCents(10.5)).toBe(1050);
    expect(toCents(0.1)).toBe(10);
    expect(toCents(0.2)).toBe(20);
    expect(toReais(30)).toBe(0.3);
    expect(toReais(1050)).toBe(10.5);
  });

  it("soma em centavos evita 0.1 + 0.2 = 0.30000000000000004", () => {
    const totalCents = toCents(0.1) + toCents(0.2);
    expect(totalCents).toBe(30);
    expect(toReais(totalCents)).toBe(0.3);
  });

  it("arredonda para o centavo mais próximo", () => {
    expect(toCents(10.005)).toBe(1001);
    expect(toCents(10.004)).toBe(1000);
  });

  it("rejeita valores não finitos", () => {
    expect(() => toCents(Number.NaN)).toThrow();
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("rejeita centavos não inteiros", () => {
    expect(() => toReais(10.5)).toThrow();
  });
});

describe("appointmentAddonTotals — tabela de cenários", () => {
  const cases: Array<{
    name: string;
    servicePriceCents: number;
    baseMinutes: number;
    snapshots: AddonSnapshot[];
    expectedTotalCents: number;
    expectedMinutes: number;
    expectedCommissionCents: number;
  }> = [
    {
      name: "0 adicionais",
      servicePriceCents: 5000,
      baseMinutes: 30,
      snapshots: [],
      expectedTotalCents: 5000,
      expectedMinutes: 30,
      expectedCommissionCents: 5000,
    },
    {
      name: "qty>1 (2 × R$10, 2 × 15min)",
      servicePriceCents: 5000,
      baseMinutes: 30,
      snapshots: [snap({ unitPriceCents: 1000, quantity: 2, durationMinutes: 15 })],
      expectedTotalCents: 7000,
      expectedMinutes: 60,
      expectedCommissionCents: 7000,
    },
    {
      name: "preço 0",
      servicePriceCents: 5000,
      baseMinutes: 30,
      snapshots: [snap({ unitPriceCents: 0, quantity: 1, durationMinutes: 10 })],
      expectedTotalCents: 5000,
      expectedMinutes: 40,
      expectedCommissionCents: 5000,
    },
    {
      name: "tempo 0",
      servicePriceCents: 5000,
      baseMinutes: 30,
      snapshots: [snap({ unitPriceCents: 500, quantity: 1, durationMinutes: 0 })],
      expectedTotalCents: 5500,
      expectedMinutes: 30,
      expectedCommissionCents: 5500,
    },
    {
      name: "múltiplos snapshots com override de preço/tempo",
      servicePriceCents: 8000,
      baseMinutes: 45,
      snapshots: [
        snap({ addonId: "a", unitPriceCents: 250, durationMinutes: 5, quantity: 1 }),
        snap({ addonId: "b", unitPriceCents: 1500, durationMinutes: 20, quantity: 2 }),
      ],
      expectedTotalCents: 11250,
      expectedMinutes: 90,
      expectedCommissionCents: 11250,
    },
    {
      name: "todos não comissionáveis",
      servicePriceCents: 5000,
      baseMinutes: 30,
      snapshots: [
        snap({ unitPriceCents: 1000, commissionable: false, quantity: 1 }),
        snap({ addonId: "a2", unitPriceCents: 2000, commissionable: false, quantity: 1 }),
      ],
      expectedTotalCents: 8000,
      expectedMinutes: 60,
      expectedCommissionCents: 5000,
    },
    {
      name: "misto (commissionable + não)",
      servicePriceCents: 5000,
      baseMinutes: 30,
      snapshots: [
        snap({ addonId: "a", unitPriceCents: 1000, commissionable: true, quantity: 1 }),
        snap({ addonId: "b", unitPriceCents: 2000, commissionable: false, quantity: 1 }),
      ],
      expectedTotalCents: 8000,
      expectedMinutes: 60,
      expectedCommissionCents: 6000,
    },
    {
      name: "arredondamento em centavos (0.10 + 0.20)",
      servicePriceCents: toCents(0.1),
      baseMinutes: 10,
      snapshots: [snap({ unitPriceCents: toCents(0.2), quantity: 1, durationMinutes: 0 })],
      expectedTotalCents: 30,
      expectedMinutes: 10,
      expectedCommissionCents: 30,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(appointmentTotal(c.servicePriceCents, c.snapshots)).toBe(
        c.expectedTotalCents
      );
      expect(totalDurationMinutes(c.baseMinutes, c.snapshots)).toBe(
        c.expectedMinutes
      );
      expect(commissionBase(c.servicePriceCents, c.snapshots)).toBe(
        c.expectedCommissionCents
      );
    });
  }
});
