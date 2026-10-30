import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  importBatchFindFirst,
  importBatchUpdateMany,
  createdEntityList,
  createdEntityMarkUndone,
  staffScheduleFindFirst,
  staffScheduleUpdate,
  staffScheduleDelete,
  scheduleFindFirst,
  scheduleUpdate,
  scheduleDelete,
  staffTimeOffFindFirst,
  staffTimeOffDelete,
  productFindFirst,
  productUpdate,
  productDelete,
  stockMovementFindMany,
  stockMovementDeleteMany,
  servicePackageFindFirst,
  servicePackageDelete,
  clientPackageFindFirst,
  clientPackageDelete,
  fiadoFindFirst,
  fiadoPaymentFindFirst,
  fiadoDelete,
  productCategoryFindFirst,
  productCategoryDelete,
  txMock,
} = vi.hoisted(() => {
  const importBatchFindFirst = vi.fn();
  const importBatchUpdateMany = vi.fn();
  const createdEntityList = vi.fn();
  const createdEntityMarkUndone = vi.fn();
  const staffScheduleFindFirst = vi.fn();
  const staffScheduleUpdate = vi.fn();
  const staffScheduleDelete = vi.fn();
  const scheduleFindFirst = vi.fn();
  const scheduleUpdate = vi.fn();
  const scheduleDelete = vi.fn();
  const staffTimeOffFindFirst = vi.fn();
  const staffTimeOffDelete = vi.fn();
  const productFindFirst = vi.fn();
  const productUpdate = vi.fn();
  const productDelete = vi.fn();
  const stockMovementFindMany = vi.fn();
  const stockMovementDeleteMany = vi.fn();
  const servicePackageFindFirst = vi.fn();
  const servicePackageDelete = vi.fn();
  const clientPackageFindFirst = vi.fn();
  const clientPackageDelete = vi.fn();
  const fiadoFindFirst = vi.fn();
  const fiadoPaymentFindFirst = vi.fn();
  const fiadoDelete = vi.fn();
  const productCategoryFindFirst = vi.fn();
  const productCategoryDelete = vi.fn();

  return {
    importBatchFindFirst,
    importBatchUpdateMany,
    createdEntityList,
    createdEntityMarkUndone,
    staffScheduleFindFirst,
    staffScheduleUpdate,
    staffScheduleDelete,
    scheduleFindFirst,
    scheduleUpdate,
    scheduleDelete,
    staffTimeOffFindFirst,
    staffTimeOffDelete,
    productFindFirst,
    productUpdate,
    productDelete,
    stockMovementFindMany,
    stockMovementDeleteMany,
    servicePackageFindFirst,
    servicePackageDelete,
    clientPackageFindFirst,
    clientPackageDelete,
    fiadoFindFirst,
    fiadoPaymentFindFirst,
    fiadoDelete,
    productCategoryFindFirst,
    productCategoryDelete,
    txMock: {
      importBatch: { findFirst: importBatchFindFirst, updateMany: importBatchUpdateMany },
      importCreatedEntity: { findMany: createdEntityList, updateMany: createdEntityMarkUndone },
      staffSchedule: {
        findFirst: staffScheduleFindFirst,
        update: staffScheduleUpdate,
        delete: staffScheduleDelete,
      },
      schedule: { findFirst: scheduleFindFirst, update: scheduleUpdate, delete: scheduleDelete },
      staffTimeOff: { findFirst: staffTimeOffFindFirst, delete: staffTimeOffDelete },
      product: { findFirst: productFindFirst, update: productUpdate, delete: productDelete },
      stockMovement: { findMany: stockMovementFindMany, deleteMany: stockMovementDeleteMany },
      servicePackage: { findFirst: servicePackageFindFirst, delete: servicePackageDelete },
      clientPackage: { findFirst: clientPackageFindFirst, delete: clientPackageDelete },
      fiado: { findFirst: fiadoFindFirst, delete: fiadoDelete },
      fiadoPayment: { findFirst: fiadoPaymentFindFirst },
      productCategory: { findFirst: productCategoryFindFirst, delete: productCategoryDelete },
    },
  };
});

vi.mock("@/libs/prismaClient", () => ({ prisma: txMock }));

vi.mock("@/libs/prismaExtensions", () => ({
  rlsTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock),
}));

vi.mock("@/shared/infra/http/requestContext", () => ({
  requestContext: { run: (_ctx: unknown, fn: () => Promise<unknown>) => fn() },
}));

import { undoImportBatch } from "./importUndo";

const SHOP = "shop-1";
const BATCH = "batch-1";
const AGORA = new Date("2026-11-05T12:00:00.000Z");
const REFERENCIA = new Date("2026-11-01T13:00:00.000Z");

function lote(overrides: Record<string, unknown> = {}) {
  return {
    id: BATCH,
    barbershopId: SHOP,
    status: "COMPLETED",
    undoneAt: null,
    createdAt: new Date("2026-11-01T12:00:00.000Z"),
    finishedAt: REFERENCIA,
    expiresAt: new Date("2026-12-01T12:00:00.000Z"),
    ...overrides,
  };
}

describe("desfazer dos tipos da Fase 2", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    importBatchFindFirst.mockReset().mockResolvedValue(lote());
    importBatchUpdateMany.mockReset().mockResolvedValue({ count: 1 });
    createdEntityList.mockReset().mockResolvedValue([]);
    createdEntityMarkUndone.mockReset().mockResolvedValue({ count: 0 });
    staffScheduleFindFirst.mockReset().mockResolvedValue(null);
    staffScheduleUpdate.mockReset().mockResolvedValue({});
    staffScheduleDelete.mockReset().mockResolvedValue({});
    scheduleFindFirst.mockReset().mockResolvedValue(null);
    scheduleUpdate.mockReset().mockResolvedValue({});
    scheduleDelete.mockReset().mockResolvedValue({});
    staffTimeOffFindFirst.mockReset().mockResolvedValue(null);
    staffTimeOffDelete.mockReset().mockResolvedValue({});
    productFindFirst.mockReset().mockResolvedValue(null);
    productUpdate.mockReset().mockResolvedValue({});
    productDelete.mockReset().mockResolvedValue({});
    stockMovementFindMany.mockReset().mockResolvedValue([]);
    stockMovementDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    servicePackageFindFirst.mockReset().mockResolvedValue(null);
    servicePackageDelete.mockReset().mockResolvedValue({});
    clientPackageFindFirst.mockReset().mockResolvedValue(null);
    clientPackageDelete.mockReset().mockResolvedValue({});
    fiadoFindFirst.mockReset().mockResolvedValue(null);
    fiadoPaymentFindFirst.mockReset().mockResolvedValue(null);
    fiadoDelete.mockReset().mockResolvedValue({});
    productCategoryFindFirst.mockReset().mockResolvedValue(null);
    productCategoryDelete.mockReset().mockResolvedValue({});
  });

  it("restaura o horário do profissional que a importação substituiu", async () => {
    createdEntityList.mockResolvedValue([
      {
        id: "e1",
        entityType: "STAFF_SCHEDULE",
        entityId: "sched-1",
        previousState: {
          before: { startTime: "10:00", endTime: "17:00", isActive: true },
          applied: { startTime: "09:00", endTime: "18:00", isActive: true },
        },
      },
    ]);
    staffScheduleFindFirst.mockResolvedValue({
      id: "sched-1",
      updatedAt: REFERENCIA,
      startTime: "09:00",
      endTime: "18:00",
      isActive: true,
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.removed).toBe(1);
    expect(result.details[0].action).toBe("restored");
    expect(staffScheduleUpdate).toHaveBeenCalledWith({
      where: { id: "sched-1" },
      data: { startTime: "10:00", endTime: "17:00", isActive: true },
    });
    expect(staffScheduleDelete).not.toHaveBeenCalled();
  });

  it("preserva o horário do profissional que o dono mexeu depois", async () => {
    createdEntityList.mockResolvedValue([
      {
        id: "e1",
        entityType: "STAFF_SCHEDULE",
        entityId: "sched-1",
        previousState: {
          before: { startTime: "10:00", endTime: "17:00", isActive: true },
          applied: { startTime: "09:00", endTime: "18:00", isActive: true },
        },
      },
    ]);
    staffScheduleFindFirst.mockResolvedValue({
      id: "sched-1",
      updatedAt: REFERENCIA,
      startTime: "11:00",
      endTime: "16:00",
      isActive: true,
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.kept).toBe(1);
    expect(result.details[0].reason).toMatch(/alterado depois/i);
    expect(staffScheduleUpdate).not.toHaveBeenCalled();
  });

  it("remove o horário do profissional que o lote criou", async () => {
    createdEntityList.mockResolvedValue([
      { id: "e1", entityType: "STAFF_SCHEDULE", entityId: "sched-1", previousState: null },
    ]);
    staffScheduleFindFirst.mockResolvedValue({
      id: "sched-1",
      updatedAt: REFERENCIA,
      startTime: "09:00",
      endTime: "18:00",
      isActive: true,
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.removed).toBe(1);
    expect(staffScheduleDelete).toHaveBeenCalledWith({ where: { id: "sched-1" } });
  });

  it("restaura o horário do estabelecimento substituído", async () => {
    createdEntityList.mockResolvedValue([
      {
        id: "e1",
        entityType: "SHOP_SCHEDULE",
        entityId: "shop-sched-1",
        previousState: {
          before: { isOpen: false, openTime: "00:00", closeTime: "00:00" },
          applied: { isOpen: true, openTime: "09:00", closeTime: "19:00" },
        },
      },
    ]);
    scheduleFindFirst.mockResolvedValue({
      id: "shop-sched-1",
      isOpen: true,
      openTime: "09:00",
      closeTime: "19:00",
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.details[0].action).toBe("restored");
    expect(scheduleUpdate).toHaveBeenCalledWith({
      where: { id: "shop-sched-1" },
      data: { isOpen: false, openTime: "00:00", closeTime: "00:00" },
    });
  });

  it("remove a folga que o lote criou", async () => {
    createdEntityList.mockResolvedValue([
      { id: "e1", entityType: "TIME_OFF", entityId: "timeoff-1", previousState: null },
    ]);
    staffTimeOffFindFirst.mockResolvedValue({
      id: "timeoff-1",
      createdAt: REFERENCIA,
      status: "APPROVED",
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.removed).toBe(1);
    expect(staffTimeOffDelete).toHaveBeenCalledWith({ where: { id: "timeoff-1" } });
  });

  it("preserva a folga que o dono cancelou depois", async () => {
    createdEntityList.mockResolvedValue([
      { id: "e1", entityType: "TIME_OFF", entityId: "timeoff-1", previousState: null },
    ]);
    staffTimeOffFindFirst.mockResolvedValue({
      id: "timeoff-1",
      createdAt: REFERENCIA,
      status: "CANCELED",
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.kept).toBe(1);
    expect(staffTimeOffDelete).not.toHaveBeenCalled();
  });

  it("remove o produto criado pelo lote junto com o movimento de estoque", async () => {
    createdEntityList.mockResolvedValue([
      { id: "e1", entityType: "PRODUCT", entityId: "prod-1", previousState: null },
    ]);
    productFindFirst.mockResolvedValue({
      id: "prod-1",
      updatedAt: REFERENCIA,
      salePrice: 39.9,
      minStock: 0,
      stockQty: 10,
      averageCost: 18,
      _count: {
        movements: 1,
        receiptItems: 0,
        saleLines: 0,
        reservations: 0,
        appointmentReservations: 0,
      },
    });
    stockMovementFindMany.mockResolvedValue([{ id: "mov-1" }]);

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.removed).toBe(1);
    expect(stockMovementDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["mov-1"] } },
    });
    expect(productDelete).toHaveBeenCalledWith({ where: { id: "prod-1" } });
  });

  it("preserva o produto que foi vendido depois", async () => {
    createdEntityList.mockResolvedValue([
      { id: "e1", entityType: "PRODUCT", entityId: "prod-1", previousState: null },
    ]);
    productFindFirst.mockResolvedValue({
      id: "prod-1",
      updatedAt: REFERENCIA,
      salePrice: 39.9,
      minStock: 0,
      stockQty: 10,
      averageCost: 18,
      _count: {
        movements: 3,
        receiptItems: 0,
        saleLines: 1,
        reservations: 0,
        appointmentReservations: 0,
      },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.kept).toBe(1);
    expect(productDelete).not.toHaveBeenCalled();
  });

  it("restaura os valores anteriores do produto substituído", async () => {
    createdEntityList.mockResolvedValue([
      {
        id: "e1",
        entityType: "PRODUCT",
        entityId: "prod-1",
        previousState: {
          before: { salePrice: 30, minStock: 1, stockQty: 2, averageCost: 10 },
          applied: { salePrice: 39.9, minStock: 0, stockQty: 2, averageCost: 10 },
        },
      },
    ]);
    productFindFirst.mockResolvedValue({
      id: "prod-1",
      updatedAt: REFERENCIA,
      salePrice: 39.9,
      minStock: 0,
      stockQty: 2,
      averageCost: 10,
      _count: {
        movements: 0,
        receiptItems: 0,
        saleLines: 0,
        reservations: 0,
        appointmentReservations: 0,
      },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.details[0].action).toBe("restored");
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: "prod-1" },
      data: { salePrice: 30, minStock: 1, stockQty: 2, averageCost: 10 },
    });
    expect(productDelete).not.toHaveBeenCalled();
  });

  it("remove a categoria de produto criada pelo lote", async () => {
    createdEntityList.mockResolvedValue([
      { id: "e1", entityType: "PRODUCT_CATEGORY", entityId: "cat-1", previousState: null },
    ]);
    productCategoryFindFirst.mockResolvedValue({
      id: "cat-1",
      updatedAt: REFERENCIA,
      _count: { products: 0 },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.removed).toBe(1);
    expect(productCategoryDelete).toHaveBeenCalledWith({ where: { id: "cat-1" } });
  });

  it("preserva a categoria que ganhou produtos depois", async () => {
    createdEntityList.mockResolvedValue([
      { id: "e1", entityType: "PRODUCT_CATEGORY", entityId: "cat-1", previousState: null },
    ]);
    productCategoryFindFirst.mockResolvedValue({
      id: "cat-1",
      updatedAt: REFERENCIA,
      _count: { products: 2 },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.kept).toBe(1);
    expect(productCategoryDelete).not.toHaveBeenCalled();
  });

  it("remove o pacote do catálogo que ninguém comprou", async () => {
    createdEntityList.mockResolvedValue([
      { id: "e1", entityType: "SERVICE_PACKAGE", entityId: "pkg-1", previousState: null },
    ]);
    servicePackageFindFirst.mockResolvedValue({
      id: "pkg-1",
      updatedAt: REFERENCIA,
      _count: { clientPackages: 0 },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.removed).toBe(1);
    expect(servicePackageDelete).toHaveBeenCalledWith({ where: { id: "pkg-1" } });
  });

  it("preserva o pacote do catálogo que já foi vendido", async () => {
    createdEntityList.mockResolvedValue([
      { id: "e1", entityType: "SERVICE_PACKAGE", entityId: "pkg-1", previousState: null },
    ]);
    servicePackageFindFirst.mockResolvedValue({
      id: "pkg-1",
      updatedAt: REFERENCIA,
      _count: { clientPackages: 1 },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.kept).toBe(1);
    expect(servicePackageDelete).not.toHaveBeenCalled();
  });

  it("remove o saldo de pacote do cliente que ninguém usou", async () => {
    createdEntityList.mockResolvedValue([
      { id: "e1", entityType: "CLIENT_PACKAGE", entityId: "cpkg-1", previousState: null },
    ]);
    clientPackageFindFirst.mockResolvedValue({
      id: "cpkg-1",
      updatedAt: REFERENCIA,
      totalSessions: 5,
      remainingSessions: 5,
      _count: { appointments: 0 },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.removed).toBe(1);
    expect(clientPackageDelete).toHaveBeenCalledWith({ where: { id: "cpkg-1" } });
  });

  it("preserva o saldo de pacote que já foi usado", async () => {
    createdEntityList.mockResolvedValue([
      { id: "e1", entityType: "CLIENT_PACKAGE", entityId: "cpkg-1", previousState: null },
    ]);
    clientPackageFindFirst.mockResolvedValue({
      id: "cpkg-1",
      updatedAt: REFERENCIA,
      totalSessions: 5,
      remainingSessions: 4,
      _count: { appointments: 1 },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.kept).toBe(1);
    expect(clientPackageDelete).not.toHaveBeenCalled();
  });

  it("remove a dívida que o lote criou", async () => {
    createdEntityList.mockResolvedValue([
      { id: "e1", entityType: "FIADO", entityId: "fiado-1", previousState: null },
    ]);
    fiadoFindFirst.mockResolvedValue({
      id: "fiado-1",
      updatedAt: REFERENCIA,
      _count: { payments: 1, adjustments: 0 },
    });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.removed).toBe(1);
    expect(fiadoDelete).toHaveBeenCalledWith({ where: { id: "fiado-1" } });
  });

  it("preserva a dívida que recebeu pagamento depois da importação", async () => {
    createdEntityList.mockResolvedValue([
      { id: "e1", entityType: "FIADO", entityId: "fiado-1", previousState: null },
    ]);
    fiadoFindFirst.mockResolvedValue({
      id: "fiado-1",
      updatedAt: REFERENCIA,
      _count: { payments: 2, adjustments: 0 },
    });
    fiadoPaymentFindFirst.mockResolvedValue({ id: "pay-2" });

    const result = await undoImportBatch(SHOP, BATCH);

    expect(result.kept).toBe(1);
    expect(result.details[0].reason).toMatch(/pagamento/i);
    expect(fiadoDelete).not.toHaveBeenCalled();
  });
});
