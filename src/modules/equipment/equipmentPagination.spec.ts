import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FastifyReply } from "fastify";

const { findMany, count } = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    equipment: { findMany, count },
    equipmentMovement: { findMany, count },
    equipmentNeed: { findMany, count },
  },
  Prisma: {},
}));

import { EquipmentRepository } from "./equipmentRepository";
import { resolveEquipmentPagination } from "./equipmentUseCases";
import { EquipmentController } from "./equipmentController";

const SHOP = "00000000-0000-4000-8000-000000000001";

function makeItem(i: number) {
  return { id: `item-${i}`, barbershopId: SHOP, name: `Item ${i}` };
}

describe("equipment — resolveEquipmentPagination", () => {
  it("sem page e sem limit: undefined (modo legado, traz tudo)", () => {
    expect(resolveEquipmentPagination({})).toBeUndefined();
  });

  it("só limit: completa page com 1", () => {
    expect(resolveEquipmentPagination({ limit: 50 })).toEqual({ page: 1, limit: 50 });
  });

  it("só page: completa limit com 20", () => {
    expect(resolveEquipmentPagination({ page: 3 })).toEqual({ page: 3, limit: 20 });
  });

  it("page e limit: preservados", () => {
    expect(resolveEquipmentPagination({ page: 2, limit: 25 })).toEqual({ page: 2, limit: 25 });
  });
});

describe("equipment — repository paginado", () => {
  let repo: EquipmentRepository;

  beforeEach(() => {
    findMany.mockReset();
    count.mockReset();
    repo = new EquipmentRepository();
  });

  it("listByBarbershop: primeira página devolve items + total + page/limit", async () => {
    findMany.mockResolvedValue([makeItem(1), makeItem(2)]);
    count.mockResolvedValue(5);

    const result = await repo.listByBarbershop(SHOP, {}, { page: 1, limit: 2 });

    expect(result.paginated).toBe(true);
    if (!result.paginated) throw new Error("esperava resultado paginado");
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(2);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 2 }));
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("listByBarbershop: página além do total devolve items vazio com total correto", async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(5);

    const result = await repo.listByBarbershop(SHOP, {}, { page: 4, limit: 2 });

    expect(result.paginated).toBe(true);
    if (!result.paginated) throw new Error("esperava resultado paginado");
    expect(result.items).toEqual([]);
    expect(result.total).toBe(5);
    expect(result.page).toBe(4);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 6, take: 2 }));
  });

  it("listByBarbershop: sem paginação devolve todos sem meta", async () => {
    findMany.mockResolvedValue([makeItem(1)]);

    const result = await repo.listByBarbershop(SHOP, {});

    expect(result.paginated).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(count).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(expect.not.objectContaining({ skip: expect.anything() }));
  });

  it("listMovements: aplica skip/take e conta o total", async () => {
    findMany.mockResolvedValue([makeItem(1)]);
    count.mockResolvedValue(3);

    const result = await repo.listMovements(SHOP, {}, { page: 2, limit: 1 });

    expect(result.paginated).toBe(true);
    if (!result.paginated) throw new Error("esperava resultado paginado");
    expect(result.total).toBe(3);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(1);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 1, take: 1 }));
  });

  it("listNeeds: aplica skip/take e conta o total", async () => {
    findMany.mockResolvedValue([makeItem(1)]);
    count.mockResolvedValue(9);

    const result = await repo.listNeeds(SHOP, {}, { page: 3, limit: 4 });

    expect(result.paginated).toBe(true);
    if (!result.paginated) throw new Error("esperava resultado paginado");
    expect(result.total).toBe(9);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(4);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 8, take: 4 }));
  });

  it("listNeeds: sem paginação devolve todos sem meta", async () => {
    findMany.mockResolvedValue([makeItem(1), makeItem(2)]);

    const result = await repo.listNeeds(SHOP, { status: "requested" });

    expect(result.paginated).toBe(false);
    expect(result.items).toHaveLength(2);
    expect(count).not.toHaveBeenCalled();
  });
});

describe("equipment — controller (resposta paginada)", () => {
  function makeRequest(query: Record<string, unknown>, role = "MASTER_ADMIN") {
    return {
      user: { role, barbershopId: role === "MASTER_ADMIN" ? undefined : SHOP },
      params: { barbershopId: SHOP },
      query,
    } as never;
  }

  function makeReply(): { send: ReturnType<typeof vi.fn> } {
    const send = vi.fn();
    return { send };
  }

  function asReply(reply: { send: ReturnType<typeof vi.fn> }) {
    return reply as unknown as FastifyReply;
  }

  function makeController(useCases: unknown) {
    const controller = new EquipmentController();
    (controller as unknown as { useCases: unknown }).useCases = useCases;
    return controller;
  }

  it("listEquipment: devolve data + meta quando há paginação", async () => {
    const listEquipment = vi.fn().mockResolvedValue({
      paginated: true,
      items: [makeItem(1)],
      total: 5,
      page: 1,
      limit: 2,
    });
    const controller = makeController({ listEquipment });
    const reply = makeReply();

    await controller.listEquipment(makeRequest({ page: 1, limit: 2 }), asReply(reply));

    expect(listEquipment).toHaveBeenCalledWith(SHOP, expect.objectContaining({ page: 1, limit: 2 }));
    expect(reply.send).toHaveBeenCalledWith({
      success: true,
      data: [makeItem(1)],
      meta: { page: 1, limit: 2, total: 5, totalPages: 3 },
    });
  });

  it("listEquipment: página além do total devolve data vazia com meta correto", async () => {
    const listEquipment = vi.fn().mockResolvedValue({
      paginated: true,
      items: [],
      total: 5,
      page: 4,
      limit: 2,
    });
    const controller = makeController({ listEquipment });
    const reply = makeReply();

    await controller.listEquipment(makeRequest({ page: 4, limit: 2 }), asReply(reply));

    expect(reply.send).toHaveBeenCalledWith({
      success: true,
      data: [],
      meta: { page: 4, limit: 2, total: 5, totalPages: 3 },
    });
  });

  it("listEquipment: sem paginação devolve só data (sem meta)", async () => {
    const listEquipment = vi.fn().mockResolvedValue({ paginated: false, items: [makeItem(1)] });
    const controller = makeController({ listEquipment });
    const reply = makeReply();

    await controller.listEquipment(makeRequest({}), asReply(reply));

    expect(reply.send).toHaveBeenCalledWith({ success: true, data: [makeItem(1)] });
  });

  it("listNeeds: devolve meta com total real", async () => {
    const listNeeds = vi.fn().mockResolvedValue({
      paginated: true,
      items: [makeItem(1)],
      total: 9,
      page: 2,
      limit: 4,
    });
    const controller = makeController({ listNeeds });
    const reply = makeReply();

    await controller.listNeeds(makeRequest({ page: 2, limit: 4 }), asReply(reply));

    expect(reply.send).toHaveBeenCalledWith({
      success: true,
      data: [makeItem(1)],
      meta: { page: 2, limit: 4, total: 9, totalPages: 3 },
    });
  });

  it("listMovements: devolve meta com total real", async () => {
    const listMovements = vi.fn().mockResolvedValue({
      paginated: true,
      items: [],
      total: 3,
      page: 2,
      limit: 1,
    });
    const controller = makeController({ listMovements });
    const reply = makeReply();

    await controller.listMovements(makeRequest({ page: 2, limit: 1 }), asReply(reply));

    expect(reply.send).toHaveBeenCalledWith({
      success: true,
      data: [],
      meta: { page: 2, limit: 1, total: 3, totalPages: 3 },
    });
  });
});
