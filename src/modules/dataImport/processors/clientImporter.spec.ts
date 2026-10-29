import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppTx } from "@/libs/prismaClient";
import { importClientRow } from "./clientImporter";
import type { ImportRowContext } from "./importRowContext";

const { salonClientFindFirst, salonClientCreate, salonClientUpdate } = vi.hoisted(() => ({
  salonClientFindFirst: vi.fn(),
  salonClientCreate: vi.fn(),
  salonClientUpdate: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: {},
}));

const tx = {
  salonClient: {
    findFirst: salonClientFindFirst,
    create: salonClientCreate,
    update: salonClientUpdate,
  },
} as unknown as AppTx;

const SHOP = "shop-1";

function contexto(overrides: Partial<ImportRowContext> = {}): ImportRowContext {
  return {
    headers: ["Nome", "WhatsApp", "Observações"],
    columnMap: new Map([
      ["name", 0],
      ["whatsapp", 1],
      ["notes", 2],
    ]),
    options: {
      updateExisting: true,
      countFinancialValues: false,
      sendReviewInvitations: false,
      includeCase: false,
    },
    segment: null,
    ...overrides,
  };
}

describe("importClientRow", () => {
  beforeEach(() => {
    salonClientFindFirst.mockReset();
    salonClientCreate.mockReset();
    salonClientUpdate.mockReset();
  });

  it("cria o cliente com o telefone normalizado e sem consentimento de marketing", async () => {
    salonClientFindFirst.mockResolvedValue(null);
    salonClientCreate.mockResolvedValue({ id: "client-1" });

    const result = await importClientRow(
      tx,
      SHOP,
      { Nome: "Ana", WhatsApp: "+55 11 98765-4321", Observações: "VIP" },
      contexto(),
    );

    expect(result.status).toBe("IMPORTED");
    expect(result.entityType).toBe("CLIENT");
    expect(salonClientCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: SHOP,
          name: "Ana",
          whatsapp: "11987654321",
          normalizedWhatsapp: "11987654321",
          notes: "VIP",
          marketingOptIn: false,
        }),
      }),
    );
  });

  it("atualiza (e não duplica) cliente que já existe", async () => {
    salonClientFindFirst.mockResolvedValue({ id: "client-1", name: "Antigo", notes: null });
    salonClientUpdate.mockResolvedValue({ id: "client-1" });

    const result = await importClientRow(
      tx,
      SHOP,
      { Nome: "Ana Nova", WhatsApp: "11987654321", Observações: "" },
      contexto(),
    );

    expect(result.status).toBe("SKIPPED");
    expect(result.entityId).toBe("client-1");
    expect(salonClientCreate).not.toHaveBeenCalled();
    expect(salonClientUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "client-1" },
        data: expect.objectContaining({ name: "Ana Nova" }),
      }),
    );
  });

  it("não atualiza cliente existente quando o dono desliga a atualização", async () => {
    salonClientFindFirst.mockResolvedValue({ id: "client-1", name: "Ana", notes: null });

    const result = await importClientRow(
      tx,
      SHOP,
      { Nome: "Ana", WhatsApp: "11987654321", Observações: "" },
      contexto({
        options: {
          updateExisting: false,
          countFinancialValues: false,
          sendReviewInvitations: false,
          includeCase: false,
        },
      }),
    );

    expect(result.status).toBe("SKIPPED");
    expect(salonClientUpdate).not.toHaveBeenCalled();
    expect(salonClientCreate).not.toHaveBeenCalled();
  });

  it("rejeita linha sem nome", async () => {
    const result = await importClientRow(
      tx,
      SHOP,
      { Nome: "", WhatsApp: "11987654321", Observações: "" },
      contexto(),
    );

    expect(result.status).toBe("FAILED");
    expect(result.message).toMatch(/nome/i);
    expect(salonClientCreate).not.toHaveBeenCalled();
  });

  it("rejeita linha sem telefone", async () => {
    const result = await importClientRow(
      tx,
      SHOP,
      { Nome: "Ana", WhatsApp: "", Observações: "" },
      contexto(),
    );

    expect(result.status).toBe("FAILED");
    expect(result.message).toMatch(/telefone/i);
  });

  it("rejeita telefone inválido", async () => {
    const result = await importClientRow(
      tx,
      SHOP,
      { Nome: "Ana", WhatsApp: "123", Observações: "" },
      contexto(),
    );

    expect(result.status).toBe("FAILED");
    expect(result.message).toMatch(/telefone inválido/i);
  });
});
