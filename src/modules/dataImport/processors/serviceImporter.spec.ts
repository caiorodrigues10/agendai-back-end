import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppTx } from "@/libs/prismaClient";
import { importServiceRow } from "./serviceImporter";
import type { ImportRowContext } from "./importRowContext";

const { serviceFindFirst, serviceCreate, categoryFindFirst, categoryCreate } = vi.hoisted(() => ({
  serviceFindFirst: vi.fn(),
  serviceCreate: vi.fn(),
  categoryFindFirst: vi.fn(),
  categoryCreate: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: {} }));

const tx = {
  service: { findFirst: serviceFindFirst, create: serviceCreate },
  serviceCategory: { findFirst: categoryFindFirst, create: categoryCreate },
} as unknown as AppTx;

const SHOP = "shop-1";

function contexto(): ImportRowContext {
  return {
    headers: ["Serviço", "Preço", "Duração", "Categoria"],
    columnMap: new Map([
      ["serviceName", 0],
      ["price", 1],
      ["durationMinutes", 2],
      ["category", 3],
    ]),
    options: {
      updateExisting: true,
      countFinancialValues: false,
      sendReviewInvitations: false,
      includeCase: false,
    },
    segment: null,
  };
}

describe("importServiceRow", () => {
  beforeEach(() => {
    serviceFindFirst.mockReset().mockResolvedValue(null);
    serviceCreate.mockReset().mockResolvedValue({ id: "service-1" });
    categoryFindFirst.mockReset().mockResolvedValue(null);
    categoryCreate.mockReset().mockResolvedValue({ id: "cat-1" });
  });

  it("cria o serviço com preço e duração convertidos", async () => {
    const result = await importServiceRow(
      tx,
      SHOP,
      { Serviço: "Corte", Preço: "80,00", Duração: "45", Categoria: "Cabelo" },
      contexto(),
    );

    expect(result.status).toBe("IMPORTED");
    expect(serviceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: SHOP,
          name: "Corte",
          price: 80,
          avgTimeMinutes: 45,
          categoryId: "cat-1",
        }),
      }),
    );
  });

  it("não duplica serviço que já existe no catálogo", async () => {
    serviceFindFirst.mockResolvedValue({ id: "service-9" });

    const result = await importServiceRow(
      tx,
      SHOP,
      { Serviço: "Corte", Preço: "80,00", Duração: "45", Categoria: "" },
      contexto(),
    );

    expect(result.status).toBe("SKIPPED");
    expect(result.entityId).toBe("service-9");
    expect(serviceCreate).not.toHaveBeenCalled();
  });

  it("rejeita preço inválido", async () => {
    const result = await importServiceRow(
      tx,
      SHOP,
      { Serviço: "Corte", Preço: "muito caro", Duração: "45", Categoria: "" },
      contexto(),
    );

    expect(result.status).toBe("FAILED");
    expect(result.message).toMatch(/preço/i);
    expect(serviceCreate).not.toHaveBeenCalled();
  });

  it("rejeita serviço sem nome", async () => {
    const result = await importServiceRow(
      tx,
      SHOP,
      { Serviço: "", Preço: "10", Duração: "30", Categoria: "" },
      contexto(),
    );

    expect(result.status).toBe("FAILED");
    expect(result.message).toMatch(/nome do serviço/i);
  });

  it("reaproveita categoria global já existente", async () => {
    categoryFindFirst.mockResolvedValue({ id: "cat-global", barbershopId: null });

    await importServiceRow(
      tx,
      SHOP,
      { Serviço: "Corte", Preço: "80", Duração: "45", Categoria: "Cabelo" },
      contexto(),
    );

    expect(categoryCreate).not.toHaveBeenCalled();
    expect(serviceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoryId: "cat-global" }) }),
    );
  });
});
