import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    aiConversation: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    aiMessage: { create: vi.fn(), findMany: vi.fn() },
    aiIntentLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
    barbershop: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    clientIdentity: { findMany: vi.fn() },
    clientSalonLink: { findMany: vi.fn() },
    salonClient: { findMany: vi.fn() },
  },
}));

import { WhatsAppAiRepository } from "./whatsappAiRepository";
import { prisma } from "@/libs/prismaClient";

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SHOP_ID = "22222222-2222-4222-8222-222222222222";

function mockPrisma() {
  return prisma as unknown as {
    aiConversation: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    aiIntentLog: {
      groupBy: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    barbershop: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    clientIdentity: { findMany: ReturnType<typeof vi.fn> };
    clientSalonLink: { findMany: ReturnType<typeof vi.fn> };
    salonClient: { findMany: ReturnType<typeof vi.fn> };
  };
}

describe("WhatsAppAiRepository — conversa", () => {
  beforeEach(() => vi.clearAllMocks());

  it("busca a conversa ativa pelas variantes do telefone", async () => {
    const db = mockPrisma();
    db.aiConversation.findFirst.mockResolvedValue({ id: "conv-1" });

    const repo = new WhatsAppAiRepository();
    await repo.findOrCreateConversation(SHOP_ID, "(11) 98888-7777");

    expect(db.aiConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          barbershopId: SHOP_ID,
          status: "ACTIVE",
          normalizedPhone: { in: expect.arrayContaining(["5511988887777", "11988887777"]) },
        }),
      })
    );
  });

  it("cria a conversa com o telefone canônico", async () => {
    const db = mockPrisma();
    db.aiConversation.findFirst.mockResolvedValue(null);
    db.aiConversation.create.mockResolvedValue({ id: "conv-1" });

    const repo = new WhatsAppAiRepository();
    await repo.findOrCreateConversation(SHOP_ID, "(11) 98888-7777");

    expect(db.aiConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          barbershopId: SHOP_ID,
          normalizedPhone: "5511988887777",
        }),
      })
    );
  });

  it("rejeita número curto demais", async () => {
    const repo = new WhatsAppAiRepository();
    await expect(repo.findOrCreateConversation(SHOP_ID, "1234")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("rejeita telefone sem dígitos", async () => {
    const repo = new WhatsAppAiRepository();
    await expect(repo.findOrCreateConversation(SHOP_ID, "abc")).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("WhatsAppAiRepository — resolução de salão pelo número", () => {
  beforeEach(() => vi.clearAllMocks());

  it("une vínculo do portal e CRM do salão, sem duplicar", async () => {
    const db = mockPrisma();
    db.clientIdentity.findMany.mockResolvedValue([{ id: "identity-1" }]);
    db.clientSalonLink.findMany.mockResolvedValue([
      {
        barbershopId: SHOP_ID,
        barbershop: { id: SHOP_ID, name: "Studio Marina", active: true, approvalStatus: "APPROVED" },
      },
    ]);
    db.salonClient.findMany.mockResolvedValue([
      {
        barbershopId: SHOP_ID,
        barbershop: { id: SHOP_ID, name: "Studio Marina", active: true, approvalStatus: "APPROVED" },
      },
      {
        barbershopId: OTHER_SHOP_ID,
        barbershop: { id: OTHER_SHOP_ID, name: "Studio Center", active: true, approvalStatus: "APPROVED" },
      },
    ]);

    const repo = new WhatsAppAiRepository();
    const salons = await repo.resolveSalonsByPhone("5511988887777");

    expect(salons).toHaveLength(2);
    expect(salons.find((salon) => salon.id === SHOP_ID)?.source).toBe("client_link");
    expect(salons.find((salon) => salon.id === OTHER_SHOP_ID)?.source).toBe("client_crm");
  });

  it("ignora salão inativo", async () => {
    const db = mockPrisma();
    db.clientIdentity.findMany.mockResolvedValue([]);
    db.clientSalonLink.findMany.mockResolvedValue([]);
    db.salonClient.findMany.mockResolvedValue([
      {
        barbershopId: SHOP_ID,
        barbershop: { id: SHOP_ID, name: "Studio Marina", active: false, approvalStatus: "APPROVED" },
      },
    ]);

    const repo = new WhatsAppAiRepository();
    expect(await repo.resolveSalonsByPhone("5511988887777")).toEqual([]);
  });

  it("não consulta vínculos sem identidade do cliente", async () => {
    const db = mockPrisma();
    db.clientIdentity.findMany.mockResolvedValue([]);
    db.clientSalonLink.findMany.mockResolvedValue([]);
    db.salonClient.findMany.mockResolvedValue([]);

    const repo = new WhatsAppAiRepository();
    await repo.resolveSalonsByPhone("5511988887777");

    expect(db.clientSalonLink.findMany).not.toHaveBeenCalled();
  });

  it("devolve lista vazia para telefone inválido", async () => {
    const db = mockPrisma();
    const repo = new WhatsAppAiRepository();

    expect(await repo.resolveSalonsByPhone("abc")).toEqual([]);
    expect(db.clientIdentity.findMany).not.toHaveBeenCalled();
  });
});

describe("WhatsAppAiRepository — estatísticas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("agrega no banco em vez de carregar todos os logs", async () => {
    const db = mockPrisma();
    db.aiIntentLog.groupBy
      .mockResolvedValueOnce([
        { intent: "pricing", _count: { _all: 3 } },
        { intent: "hours", _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { handledBy: "AI", _count: { _all: 3 } },
        { handledBy: "HYBRID", _count: { _all: 1 } },
      ]);
    db.aiIntentLog.aggregate.mockResolvedValue({ _avg: { confidence: 0.72 } });
    db.aiIntentLog.count.mockResolvedValue(4);

    const repo = new WhatsAppAiRepository();
    const stats = await repo.getIntentStats(SHOP_ID);

    expect(stats).toEqual({
      total: 4,
      byIntent: { pricing: 3, hours: 1 },
      byHandledBy: { AI: 3, HYBRID: 1 },
      avgConfidence: 0.72,
    });
  });
});

describe("WhatsAppAiRepository — configuração", () => {
  beforeEach(() => vi.clearAllMocks());

  it("liga o atendente de IA do salão", async () => {
    const db = mockPrisma();
    db.barbershop.update.mockResolvedValue({
      id: SHOP_ID,
      name: "Studio Marina",
      active: true,
      whatsappAiEnabled: true,
    });

    const repo = new WhatsAppAiRepository();
    const result = await repo.setAiEnabled(SHOP_ID, true);

    expect(db.barbershop.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { whatsappAiEnabled: true } })
    );
    expect(result.whatsappAiEnabled).toBe(true);
  });
});
