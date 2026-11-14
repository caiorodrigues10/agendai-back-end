import { describe, expect, it } from "vitest";
import { validateAddonSelection } from "./validateAddonSelection";
import {
  AddonSelectionError,
  MAX_DISTINCT_ADDONS,
  type AddonCatalogEntry,
} from "./addonTypes";

function entry(overrides: Partial<AddonCatalogEntry> = {}): AddonCatalogEntry {
  return {
    addonId: "a1",
    active: true,
    linked: true,
    maxQuantity: 10,
    ...overrides,
  };
}

describe("validateAddonSelection", () => {
  it("aceita seleção vazia (0 adicionais)", () => {
    expect(validateAddonSelection([], [entry()])).toEqual([]);
  });

  it("aceita qty válida e normaliza itens", () => {
    const result = validateAddonSelection(
      [{ addonId: "a1", quantity: 3 }],
      [entry()]
    );
    expect(result).toEqual([{ addonId: "a1", quantity: 3 }]);
  });

  it("soma itens duplicados do mesmo addonId antes de validar", () => {
    const result = validateAddonSelection(
      [
        { addonId: "a1", quantity: 4 },
        { addonId: "a1", quantity: 6 },
      ],
      [entry({ maxQuantity: 10 })]
    );
    expect(result).toEqual([{ addonId: "a1", quantity: 10 }]);
  });

  it("rejeita soma duplicada acima de maxQuantity", () => {
    expect(() =>
      validateAddonSelection(
        [
          { addonId: "a1", quantity: 6 },
          { addonId: "a1", quantity: 6 },
        ],
        [entry({ maxQuantity: 10 })]
      )
    ).toThrow(
      expect.objectContaining({ code: "QUANTITY_OUT_OF_RANGE" } as never)
    );
  });

  it("rejeita qty = 0", () => {
    expect(() =>
      validateAddonSelection([{ addonId: "a1", quantity: 0 }], [entry()])
    ).toThrow(AddonSelectionError);
  });

  it("rejeita qty > maxQuantity", () => {
    try {
      validateAddonSelection(
        [{ addonId: "a1", quantity: 11 }],
        [entry({ maxQuantity: 10 })]
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AddonSelectionError);
      expect((err as AddonSelectionError).code).toBe("QUANTITY_OUT_OF_RANGE");
      expect((err as AddonSelectionError).addonId).toBe("a1");
    }
  });

  it("rejeita adicional inexistente no catálogo", () => {
    try {
      validateAddonSelection([{ addonId: "ghost", quantity: 1 }], [entry()]);
      expect.unreachable();
    } catch (err) {
      expect((err as AddonSelectionError).code).toBe("ADDON_NOT_FOUND");
    }
  });

  it("rejeita adicional inativo", () => {
    try {
      validateAddonSelection(
        [{ addonId: "a1", quantity: 1 }],
        [entry({ active: false })]
      );
      expect.unreachable();
    } catch (err) {
      expect((err as AddonSelectionError).code).toBe("ADDON_INACTIVE");
    }
  });

  it("rejeita adicional não vinculado ao serviço", () => {
    try {
      validateAddonSelection(
        [{ addonId: "a1", quantity: 1 }],
        [entry({ linked: false })]
      );
      expect.unreachable();
    } catch (err) {
      expect((err as AddonSelectionError).code).toBe("ADDON_NOT_LINKED");
    }
  });

  it(`rejeita mais de ${MAX_DISTINCT_ADDONS} distintos`, () => {
    const catalog: AddonCatalogEntry[] = [];
    const items: { addonId: string; quantity: number }[] = [];
    for (let i = 0; i <= MAX_DISTINCT_ADDONS; i += 1) {
      const id = `a${i}`;
      catalog.push(entry({ addonId: id }));
      items.push({ addonId: id, quantity: 1 });
    }
    try {
      validateAddonSelection(items, catalog);
      expect.unreachable();
    } catch (err) {
      expect((err as AddonSelectionError).code).toBe("TOO_MANY_DISTINCT");
    }
  });

  it(`aceita exatamente ${MAX_DISTINCT_ADDONS} distintos`, () => {
    const catalog: AddonCatalogEntry[] = [];
    const items: { addonId: string; quantity: number }[] = [];
    for (let i = 0; i < MAX_DISTINCT_ADDONS; i += 1) {
      const id = `a${i}`;
      catalog.push(entry({ addonId: id }));
      items.push({ addonId: id, quantity: 1 });
    }
    const result = validateAddonSelection(items, catalog);
    expect(result).toHaveLength(MAX_DISTINCT_ADDONS);
  });
});
