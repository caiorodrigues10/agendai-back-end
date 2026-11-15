import { describe, expect, it, vi } from "vitest";
import { resolveAddonSelection } from "./resolveAddonSelection";

type MockAddon = {
  name: string;
  price: number;
  durationMinutes: number;
  active: boolean;
  availableOnline: boolean;
  maxQuantity: number;
  commissionable: boolean;
};

function dbWith(addon: Partial<MockAddon> & { priceOverride?: number | null; timeOverride?: number | null } = {}) {
  const findMany = vi.fn().mockResolvedValue([
    {
      addonId: "addon-1",
      priceOverride: addon.priceOverride ?? null,
      timeOverride: addon.timeOverride ?? null,
      addon: {
        name: addon.name ?? "Adicional",
        price: addon.price ?? 20,
        durationMinutes: addon.durationMinutes ?? 30,
        active: addon.active ?? true,
        availableOnline: addon.availableOnline ?? true,
        maxQuantity: addon.maxQuantity ?? 3,
        commissionable: addon.commissionable ?? true,
      },
    },
  ]);
  return { db: { serviceAddonLink: { findMany } } as never, findMany };
}

describe("resolveAddonSelection", () => {
  it("soma duplicados e grava o snapshot com preço/tempo efetivos", async () => {
    const { db, findMany } = dbWith({ priceOverride: 25, timeOverride: 45 });

    const snapshots = await resolveAddonSelection(db, {
      barbershopId: "shop-a",
      serviceId: "service-a",
      items: [
        { addonId: "addon-1", quantity: 1 },
        { addonId: "addon-1", quantity: 2 },
      ],
    });

    expect(snapshots).toEqual([
      {
        addonId: "addon-1",
        name: "Adicional",
        unitPriceCents: 2500,
        quantity: 3,
        durationMinutes: 45,
        commissionable: true,
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          barbershopId: "shop-a",
          serviceId: "service-a",
          service: { barbershopId: "shop-a" },
          addon: { barbershopId: "shop-a", deletedAt: null },
        }),
      })
    );
  });

  it("rejeita adicional inativo", async () => {
    const { db } = dbWith({ active: false });

    await expect(
      resolveAddonSelection(db, {
        barbershopId: "shop-a",
        serviceId: "service-a",
        items: [{ addonId: "addon-1", quantity: 1 }],
      })
    ).rejects.toMatchObject({ statusCode: 400, code: "ADDON_INACTIVE" });
  });

  it("rejeita soma de duplicados acima do maxQuantity", async () => {
    const { db } = dbWith({ maxQuantity: 3 });

    await expect(
      resolveAddonSelection(db, {
        barbershopId: "shop-a",
        serviceId: "service-a",
        items: [
          { addonId: "addon-1", quantity: 2 },
          { addonId: "addon-1", quantity: 2 },
        ],
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "QUANTITY_OUT_OF_RANGE",
    });
  });

  it("público não resolve adicional indisponível online", async () => {
    const { db } = dbWith({ availableOnline: false });

    await expect(
      resolveAddonSelection(db, {
        barbershopId: "shop-a",
        serviceId: "service-a",
        items: [{ addonId: "addon-1", quantity: 1 }],
        visibility: "public",
      })
    ).rejects.toMatchObject({ statusCode: 400, code: "ADDON_NOT_FOUND" });
  });

  it("staff pode resolver adicional indisponível online", async () => {
    const { db } = dbWith({ availableOnline: false });

    await expect(
      resolveAddonSelection(db, {
        barbershopId: "shop-a",
        serviceId: "service-a",
        items: [{ addonId: "addon-1", quantity: 1 }],
        visibility: "staff",
      })
    ).resolves.toHaveLength(1);
  });
});
