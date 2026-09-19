import { describe, it, expect, beforeEach } from "vitest";
import type { z } from "zod";
import { EquipmentUseCases } from "./equipmentUseCases";
import { AppError } from "@/shared/errors/AppError";
import type { createEquipmentSchema, createNeedSchema } from "./equipmentSchema";

type EquipmentInput = z.infer<typeof createEquipmentSchema>;
type NeedInput = z.infer<typeof createNeedSchema>;

// ─── In-memory store ────────────────────────────────────────

let equipId = 0;
let movementId = 0;
let needId = 0;

interface MockEquip {
  id: string;
  barbershopId: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  quantityTotal: number;
  quantityAvailable: number;
  condition: string;
  minQuantity: number;
  unitCost: number | null;
  supplier: string | null;
  purchaseDate: Date | null;
  warrantyUntil: Date | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  barbershop: { id: string; name: string };
}

interface MockMovement {
  id: string;
  equipmentId: string;
  barbershopId: string;
  type: string;
  quantity: number;
  reason: string | null;
  staffId: string | null;
  createdAt: Date;
}

interface MockNeed {
  id: string;
  barbershopId: string;
  equipmentId: string | null;
  name: string;
  quantityNeeded: number;
  priority: string;
  reason: string | null;
  estimatedCost: number | null;
  status: string;
  requestedBy: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

const equipments: MockEquip[] = [];
const movements: MockMovement[] = [];
const needs: MockNeed[] = [];

function makeEquip(overrides: Partial<MockEquip> & { barbershopId: string; name: string }): MockEquip {
  const e: MockEquip = {
    id: `equip-${++equipId}`,
    barbershopId: overrides.barbershopId,
    name: overrides.name,
    category: overrides.category ?? "OTHER",
    brand: overrides.brand ?? null,
    model: overrides.model ?? null,
    serialNumber: overrides.serialNumber ?? null,
    quantityTotal: overrides.quantityTotal ?? 10,
    quantityAvailable: overrides.quantityAvailable ?? overrides.quantityTotal ?? 10,
    condition: overrides.condition ?? "NEW",
    minQuantity: overrides.minQuantity ?? 0,
    unitCost: overrides.unitCost ?? null,
    supplier: overrides.supplier ?? null,
    purchaseDate: overrides.purchaseDate ?? null,
    warrantyUntil: overrides.warrantyUntil ?? null,
    notes: overrides.notes ?? null,
    isActive: overrides.isActive ?? true,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    barbershop: overrides.barbershop ?? { id: overrides.barbershopId, name: "Barbearia Teste" },
  };
  equipments.push(e);
  return e;
}

function makeNeed(overrides: Partial<MockNeed> & { barbershopId: string; name: string }): MockNeed {
  const n: MockNeed = {
    id: `need-${++needId}`,
    barbershopId: overrides.barbershopId,
    equipmentId: overrides.equipmentId ?? null,
    name: overrides.name,
    quantityNeeded: overrides.quantityNeeded ?? 1,
    priority: overrides.priority ?? "MEDIUM",
    reason: overrides.reason ?? null,
    estimatedCost: overrides.estimatedCost ?? null,
    status: overrides.status ?? "REQUESTED",
    requestedBy: overrides.requestedBy ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    resolvedAt: overrides.resolvedAt ?? null,
  };
  needs.push(n);
  return n;
}

// ─── Mock repository ────────────────────────────────────────

const mockRepo = {
  listByBarbershop: async (barbershopId: string, filters?: any) =>
    equipments.filter(
      (e) =>
        e.barbershopId === barbershopId &&
        e.isActive &&
        (!filters?.category || e.category === filters.category.toUpperCase()) &&
        (!filters?.condition || e.condition === filters.condition.toUpperCase()) &&
        (!filters?.search || e.name.toLowerCase().includes(filters.search.toLowerCase()))
    ),

  findById: async (id: string) => equipments.find((e) => e.id === id) ?? null,

  findBySerialNumber: async (barbershopId: string, serialNumber: string) => {
    const found = equipments.find((e) => e.barbershopId === barbershopId && e.serialNumber === serialNumber);
    return found ? { id: found.id } : null;
  },

  create: async (data: any) => {
    const e = makeEquip({
      barbershopId: data.barbershopId,
      name: data.name,
      category: (data.category ?? "OTHER").toUpperCase(),
      brand: data.brand,
      model: data.model,
      serialNumber: data.serialNumber,
      quantityTotal: data.quantityTotal ?? 1,
      quantityAvailable: data.quantityAvailable ?? data.quantityTotal ?? 1,
      condition: (data.condition ?? "NEW").toUpperCase(),
      minQuantity: data.minQuantity ?? 0,
      unitCost: data.unitCost,
      supplier: data.supplier,
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
      warrantyUntil: data.warrantyUntil ? new Date(data.warrantyUntil) : null,
      notes: data.notes,
    });
    return e;
  },

  update: async (id: string, data: any) => {
    const idx = equipments.findIndex((e) => e.id === id);
    if (idx < 0) throw new AppError("Equipamento nao encontrado", 404);
    equipments[idx] = { ...equipments[idx], ...data, updatedAt: new Date() };
    return equipments[idx];
  },

  delete: async (id: string) => {
    const idx = equipments.findIndex((e) => e.id === id);
    if (idx < 0) throw new AppError("Equipamento nao encontrado", 404);
    equipments.splice(idx, 1);
  },

  updateQuantity: async (id: string, quantityAvailable: number) => {
    const idx = equipments.findIndex((e) => e.id === id);
    if (idx < 0) throw new AppError("Equipamento nao encontrado", 404);
    equipments[idx] = { ...equipments[idx], quantityAvailable, updatedAt: new Date() };
    return equipments[idx];
  },

  listMovements: async (barbershopId: string, filters?: any) =>
    movements.filter(
      (m) =>
        m.barbershopId === barbershopId &&
        (!filters?.equipmentId || m.equipmentId === filters.equipmentId) &&
        (!filters?.type || m.type === filters.type.toUpperCase())
    ),

  createMovement: async (data: any) => {
    const m: MockMovement = {
      id: `mov-${++movementId}`,
      equipmentId: data.equipmentId,
      barbershopId: data.barbershopId,
      type: data.type.toUpperCase(),
      quantity: data.quantity,
      reason: data.reason ?? null,
      staffId: data.staffId ?? null,
      createdAt: new Date(),
    };
    movements.push(m);
    return m;
  },

  listNeeds: async (barbershopId: string, filters?: any) =>
    needs.filter(
      (n) =>
        n.barbershopId === barbershopId &&
        (!filters?.status || n.status === filters.status.toUpperCase()) &&
        (!filters?.priority || n.priority === filters.priority.toUpperCase())
    ),

  findNeedById: async (id: string) => needs.find((n) => n.id === id) ?? null,

  createNeed: async (data: any) => {
    const n: MockNeed = {
      id: `need-${++needId}`,
      barbershopId: data.barbershopId,
      equipmentId: data.equipmentId ?? null,
      name: data.name,
      quantityNeeded: data.quantityNeeded ?? 1,
      priority: (data.priority ?? "MEDIUM").toUpperCase(),
      reason: data.reason ?? null,
      estimatedCost: data.estimatedCost ?? null,
      status: "REQUESTED",
      requestedBy: data.requestedBy ?? null,
      createdAt: new Date(),
      resolvedAt: null,
    };
    needs.push(n);
    return n;
  },

  updateNeed: async (id: string, data: any) => {
    const idx = needs.findIndex((n) => n.id === id);
    if (idx < 0) throw new AppError("Necessidade nao encontrada", 404);
    needs[idx] = {
      ...needs[idx],
      ...(data.status && { status: data.status.toUpperCase() }),
      ...(data.priority && { priority: data.priority.toUpperCase() }),
      ...(data.reason !== undefined && { reason: data.reason }),
      ...(data.estimatedCost !== undefined && { estimatedCost: data.estimatedCost }),
      ...(data.status === "received" ? { resolvedAt: new Date() } : {}),
    };
    return needs[idx];
  },

  countByBarbershop: async (barbershopId: string) => {
    const shop = equipments.filter((e) => e.barbershopId === barbershopId);
    const active = shop.filter((e) => e.isActive);
    return {
      totalEquipment: shop.length,
      activeEquipment: active.length,
      lowStockCount: active.filter((e) => e.minQuantity > 0 && e.quantityAvailable < e.minQuantity).length,
      pendingNeeds: needs.filter((n) => n.barbershopId === barbershopId && n.status === "REQUESTED").length,
      recentMovements: movements.filter((m) => m.barbershopId === barbershopId).length,
    };
  },

  getLowStockItems: async (barbershopId: string) =>
    equipments
      .filter(
        (e) => e.barbershopId === barbershopId && e.isActive && e.minQuantity > 0 && e.quantityAvailable < e.minQuantity
      )
      .map((e) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        quantityTotal: e.quantityTotal,
        quantityAvailable: e.quantityAvailable,
        minQuantity: e.minQuantity,
        condition: e.condition,
      })),
};

// ─── Test subject ───────────────────────────────────────────

let useCases: EquipmentUseCases;

beforeEach(() => {
  equipments.length = 0;
  movements.length = 0;
  needs.length = 0;
  equipId = 0;
  movementId = 0;
  needId = 0;

  useCases = new EquipmentUseCases();
  (useCases as any).repo = mockRepo;
});

const SHOP = "shop-1";

function equipData(overrides: Partial<EquipmentInput> & { barbershopId: string; name: string }): EquipmentInput {
  return {
    category: "other",
    condition: "new",
    quantityTotal: 10,
    quantityAvailable: 10,
    minQuantity: 0,
    ...overrides,
  } as EquipmentInput;
}

function needData(overrides: Partial<NeedInput> & { barbershopId: string; name: string }): NeedInput {
  return {
    priority: "medium",
    quantityNeeded: 1,
    ...overrides,
  } as NeedInput;
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe("Equipment CRUD", () => {
  it("creates equipment with default quantities", async () => {
    const equip = await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP,
      name: "Maquina de barba",
      category: "beard_tools",
      quantityTotal: 5,
      quantityAvailable: 5,
    }));
    expect(equip.name).toBe("Maquina de barba");
    expect(equip.quantityTotal).toBe(5);
    expect(equip.quantityAvailable).toBe(5);
  });

  it("rejects serialNumber duplicate in same barbershop", async () => {
    await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP,
      name: "Equip A",
      serialNumber: "SN-001",
    }));
    await expect(
      useCases.createEquipment(SHOP, equipData({
        barbershopId: SHOP,
        name: "Equip B",
        serialNumber: "SN-001",
      }))
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("allows same serialNumber in different barbershops", async () => {
    await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP,
      name: "Equip A",
      serialNumber: "SN-001",
    }));
    const equip2 = await useCases.createEquipment("shop-2", equipData({
      barbershopId: "shop-2",
      name: "Equip B",
      serialNumber: "SN-001",
    }));
    expect(equip2.serialNumber).toBe("SN-001");
  });

  it("rejects quantityAvailable > quantityTotal", async () => {
    await expect(
      useCases.createEquipment(SHOP, equipData({
        barbershopId: SHOP,
        name: "Bad equip",
        quantityTotal: 3,
        quantityAvailable: 5,
      }))
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("updates equipment with valid quantity bounds", async () => {
    const equip = await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP,
      name: "Cadeira",
      quantityTotal: 5,
      quantityAvailable: 5,
    }));
    const updated = await useCases.updateEquipment(equip.id, SHOP, {
      quantityTotal: 10,
      quantityAvailable: 8,
    });
    expect(updated.quantityTotal).toBe(10);
    expect(updated.quantityAvailable).toBe(8);
  });

  it("rejects update making quantityAvailable > quantityTotal", async () => {
    const equip = await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP, name: "Cadeira", quantityTotal: 5, quantityAvailable: 5,
    }));
    await expect(
      useCases.updateEquipment(equip.id, SHOP, { quantityAvailable: 10 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects updating non-existent equipment", async () => {
    await expect(
      useCases.updateEquipment("fake-id", SHOP, { name: "X" })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects access from wrong barbershop", async () => {
    const equip = await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP, name: "Cadeira",
    }));
    await expect(
      useCases.getEquipment(equip.id, "wrong-shop")
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("deletes equipment", async () => {
    const equip = await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP, name: "To delete",
    }));
    await useCases.deleteEquipment(equip.id, SHOP);
    await expect(useCases.getEquipment(equip.id, SHOP)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("Movements", () => {
  it("creates IN movement (stock increases)", async () => {
    const equip = await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP, name: "Tesoura", quantityTotal: 10, quantityAvailable: 5,
    }));
    const mov = await useCases.createMovement(SHOP, {
      equipmentId: equip.id, barbershopId: SHOP, type: "in", quantity: 3,
    });
    expect(mov.type).toBe("IN");
    expect(mov.quantity).toBe(3);
    const updated = await useCases.getEquipment(equip.id, SHOP);
    expect(updated.quantityAvailable).toBe(8);
  });

  it("creates OUT movement (stock decreases)", async () => {
    const equip = await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP, name: "Tesoura", quantityTotal: 10, quantityAvailable: 10,
    }));
    await useCases.createMovement(SHOP, {
      equipmentId: equip.id, barbershopId: SHOP, type: "out", quantity: 4,
    });
    const updated = await useCases.getEquipment(equip.id, SHOP);
    expect(updated.quantityAvailable).toBe(6);
  });

  it("rejects OUT when insufficient stock", async () => {
    const equip = await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP, name: "Tesoura", quantityTotal: 10, quantityAvailable: 2,
    }));
    await expect(
      useCases.createMovement(SHOP, {
        equipmentId: equip.id, barbershopId: SHOP, type: "out", quantity: 5,
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("IN does not exceed quantityTotal", async () => {
    const equip = await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP, name: "Tesoura", quantityTotal: 5, quantityAvailable: 3,
    }));
    await useCases.createMovement(SHOP, {
      equipmentId: equip.id, barbershopId: SHOP, type: "in", quantity: 10,
    });
    const updated = await useCases.getEquipment(equip.id, SHOP);
    expect(updated.quantityAvailable).toBe(5);
  });

  it("LOSS movement decreases stock", async () => {
    const equip = await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP, name: "Pente", quantityTotal: 10, quantityAvailable: 10,
    }));
    await useCases.createMovement(SHOP, {
      equipmentId: equip.id, barbershopId: SHOP, type: "loss", quantity: 2,
    });
    const updated = await useCases.getEquipment(equip.id, SHOP);
    expect(updated.quantityAvailable).toBe(8);
  });

  it("MAINTENANCE does not change quantity", async () => {
    const equip = await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP, name: "Cadeira", quantityTotal: 5, quantityAvailable: 5,
    }));
    await useCases.createMovement(SHOP, {
      equipmentId: equip.id, barbershopId: SHOP, type: "maintenance", quantity: 1,
    });
    const updated = await useCases.getEquipment(equip.id, SHOP);
    expect(updated.quantityAvailable).toBe(5);
  });

  it("rejects movement for non-existent equipment", async () => {
    await expect(
      useCases.createMovement(SHOP, {
        equipmentId: "fake-id", barbershopId: SHOP, type: "in", quantity: 1,
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("Auto-creation of EquipmentNeed", () => {
  it("auto-creates need when quantityAvailable < minQuantity on create", async () => {
    await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP, name: "Shampoo profissional",
      quantityTotal: 10, quantityAvailable: 1, minQuantity: 5,
    }));
    const shopNeeds = needs.filter((n) => n.barbershopId === SHOP && n.equipmentId !== null);
    expect(shopNeeds.length).toBe(1);
    expect(shopNeeds[0].priority).toBe("HIGH");
    expect(shopNeeds[0].quantityNeeded).toBe(5);
  });

  it("auto-creates need when stock drops via movement", async () => {
    const equip = await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP, name: "Shampoo",
      quantityTotal: 10, quantityAvailable: 6, minQuantity: 5,
    }));
    expect(needs.filter((n) => n.equipmentId === equip.id).length).toBe(0);

    await useCases.createMovement(SHOP, {
      equipmentId: equip.id, barbershopId: SHOP, type: "out", quantity: 2,
    });
    const shopNeeds = needs.filter((n) => n.equipmentId === equip.id);
    expect(shopNeeds.length).toBe(1);
    expect(shopNeeds[0].quantityNeeded).toBe(2);
  });

  it("does not duplicate need if one already exists", async () => {
    await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP, name: "Shampoo",
      quantityTotal: 10, quantityAvailable: 1, minQuantity: 5,
    }));
    await useCases.createEquipment(SHOP, equipData({
      barbershopId: SHOP, name: "Shampoo again",
      quantityTotal: 10, quantityAvailable: 0, minQuantity: 5,
    }));
    const shopNeeds = needs.filter(
      (n) => n.barbershopId === SHOP && n.equipmentId !== null
    );
    expect(shopNeeds.length).toBe(2);
  });
});

describe("EquipmentNeeds", () => {
  it("creates and updates need", async () => {
    const need = await useCases.createNeed(SHOP, needData({
      barbershopId: SHOP, name: "Nova tesoura", quantityNeeded: 3, priority: "high",
    }));
    expect(need.status).toBe("REQUESTED");

    const updated = await useCases.updateNeed(need.id, SHOP, { status: "approved" });
    expect(updated.status).toBe("APPROVED");
  });

  it("rejects updating need from wrong barbershop", async () => {
    const need = await useCases.createNeed(SHOP, needData({
      barbershopId: SHOP, name: "Item",
    }));
    await expect(
      useCases.updateNeed(need.id, "wrong-shop", { status: "approved" })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("sets resolvedAt when status becomes received", async () => {
    const need = await useCases.createNeed(SHOP, needData({
      barbershopId: SHOP, name: "Item",
    }));
    const updated = await useCases.updateNeed(need.id, SHOP, { status: "received" });
    expect(updated.resolvedAt).toBeInstanceOf(Date);
  });
});

describe("Dashboard", () => {
  it("returns summary counts", async () => {
    makeEquip({ barbershopId: SHOP, name: "A", quantityTotal: 10, quantityAvailable: 10, minQuantity: 0 });
    makeEquip({ barbershopId: SHOP, name: "B", quantityTotal: 5, quantityAvailable: 1, minQuantity: 3 });
    makeNeed({ barbershopId: SHOP, name: "Need 1" });

    const dash = await useCases.getDashboard(SHOP, {});
    expect(dash.totalEquipment).toBe(2);
    expect(dash.activeEquipment).toBe(2);
    expect(dash.lowStockCount).toBe(1);
    expect(dash.pendingNeeds).toBe(1);
  });

  it("lowStock compares quantityAvailable vs minQuantity, not a fixed threshold", async () => {
    // High quantityAvailable (50) but minQuantity is even higher (60) => LOW STOCK
    makeEquip({
      barbershopId: SHOP, name: "Expensive clipper",
      quantityTotal: 60, quantityAvailable: 50, minQuantity: 60,
    });
    // Low quantityAvailable (2) but minQuantity is 0 => NOT low stock
    makeEquip({
      barbershopId: SHOP, name: "Cheap comb",
      quantityTotal: 10, quantityAvailable: 2, minQuantity: 0,
    });
    // Exactly at min => NOT low stock
    makeEquip({
      barbershopId: SHOP, name: "Exact",
      quantityTotal: 10, quantityAvailable: 5, minQuantity: 5,
    });

    const dash = await useCases.getDashboard(SHOP, {});
    expect(dash.lowStockCount).toBe(1);
    expect(dash.lowStockItems.length).toBe(1);
    expect(dash.lowStockItems[0].name).toBe("Expensive clipper");
  });
});
