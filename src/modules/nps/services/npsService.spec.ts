import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createSurveysForShop,
  getPublicSurvey,
  isShopEligible,
  listSurveys,
  npsSummary,
  recordResponse,
} from "./npsService";
import { createAuditLog } from "@/shared/services/auditLogService";

const txMock = {
  npsResponse: { create: vi.fn() },
  npsSurvey: { update: vi.fn() },
};

const prismaMock = vi.hoisted(() => ({
  barbershop: { findUnique: vi.fn() },
  salonClient: { findMany: vi.fn() },
  notificationPreference: { findUnique: vi.fn() },
  notificationSuppression: { findFirst: vi.fn() },
  npsSurvey: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
  },
  npsResponse: { groupBy: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
  Prisma: { TransactionClient: class {} },
}));

vi.mock("@/shared/services/auditLogService", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const ACTIVE_SHOP = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Barbearia Central",
  active: true,
  subscriptions: [{ status: "ACTIVE", startDate: new Date() }],
};

describe("npsService.isShopEligible", () => {
  const now = new Date("2026-10-01T12:00:00Z");

  it("exige salão ativo", () => {
    expect(
      isShopEligible({ active: false, subscription: { status: "ACTIVE", startDate: now } }, now),
    ).toEqual({ eligible: false, reason: "SHOP_INACTIVE" });
  });

  it("exige assinatura existente", () => {
    expect(isShopEligible({ active: true, subscription: null }, now)).toEqual({
      eligible: false,
      reason: "NO_SUBSCRIPTION",
    });
  });

  it("aceita assinatura ACTIVE", () => {
    expect(
      isShopEligible({ active: true, subscription: { status: "ACTIVE", startDate: now } }, now),
    ).toEqual({ eligible: true });
  });

  it("aceita TRIALING com pelo menos 14 dias e rejeita trial novo", () => {
    const oldTrial = new Date(now.getTime() - 15 * 86_400_000);
    const youngTrial = new Date(now.getTime() - 3 * 86_400_000);
    expect(isShopEligible({ active: true, subscription: { status: "TRIALING", startDate: oldTrial } }, now)).toEqual({
      eligible: true,
    });
    expect(
      isShopEligible({ active: true, subscription: { status: "TRIALING", startDate: youngTrial } }, now),
    ).toEqual({ eligible: false, reason: "TRIAL_TOO_YOUNG" });
  });

  it("rejeita assinaturas fora de ACTIVE/TRIALING", () => {
    expect(
      isShopEligible({ active: true, subscription: { status: "CANCELED", startDate: now } }, now),
    ).toEqual({ eligible: false, reason: "SUBSCRIPTION_NOT_ELIGIBLE" });
  });
});

describe("npsService.createSurveysForShop", () => {
  beforeEach(() => vi.clearAllMocks());

  it("falha com 400 quando o salão não é elegível", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue({
      ...ACTIVE_SHOP,
      subscriptions: [{ status: "CANCELED", startDate: new Date() }],
    });

    await expect(
      createSurveysForShop({
        barbershopId: ACTIVE_SHOP.id,
        limit: 10,
        requestedBy: "master-1",
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "SUBSCRIPTION_NOT_ELIGIBLE" });
  });

  it("respeita a preferência NPS desativada do salão", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue(ACTIVE_SHOP);
    prismaMock.salonClient.findMany.mockResolvedValue([
      { id: "c1", whatsapp: "11999999999", normalizedWhatsapp: "5511999999999" },
      { id: "c2", whatsapp: "11888888888", normalizedWhatsapp: "5511888888888" },
    ]);
    prismaMock.notificationPreference.findUnique.mockResolvedValue({ enabled: false });

    const result = await createSurveysForShop({
      barbershopId: ACTIVE_SHOP.id,
      limit: 10,
      requestedBy: "master-1",
    });

    expect(result).toMatchObject({
      created: 0,
      skipped: { preferenceDisabled: 2 },
      surveys: [],
    });
    expect(prismaMock.notificationSuppression.findFirst).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("cria pesquisa com hash/máscara, aplica supressão, cooldown e pula ativas", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue(ACTIVE_SHOP);
    prismaMock.salonClient.findMany.mockResolvedValue([
      { id: "c-ok", whatsapp: "11999999999", normalizedWhatsapp: "5511999999999" },
      { id: "c-supp", whatsapp: "11888888888", normalizedWhatsapp: "5511888888888" },
      { id: "c-active", whatsapp: "11777777777", normalizedWhatsapp: "5511777777777" },
      { id: "c-cooldown", whatsapp: "11666666666", normalizedWhatsapp: "5511666666666" },
    ]);
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);
    // supressão: c-ok não suprimida, c-supp suprimida, c-active/c-cooldown não.
    prismaMock.notificationSuppression.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "sup-1" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    // npsSurvey.findFirst por cliente: [ativa, respondida<90d]
    // c-ok: [null, null] → c-active: [ativa] → c-cooldown: [null, respondida]
    prismaMock.npsSurvey.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "pending" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "answered" });
    prismaMock.npsSurvey.create.mockResolvedValue({
      id: "survey-1",
      destinationMasked: "***99999",
      expiresAt: new Date("2026-10-16T12:00:00Z"),
    });

    const result = await createSurveysForShop({
      barbershopId: ACTIVE_SHOP.id,
      limit: 10,
      requestedBy: "master-1",
      ipAddress: "127.0.0.1",
    });

    expect(result.created).toBe(1);
    expect(result.skipped).toEqual({
      preferenceDisabled: 0,
      suppressed: 1,
      cooldown: 1,
      active: 1,
      noContact: 0,
    });
    expect(result.surveys[0]).toMatchObject({ id: "survey-1" });
    const created = prismaMock.npsSurvey.create.mock.calls[0][0] as {
      data: { respondentKey: string; destinationMasked: string; channel: string };
    };
    expect(created.data.channel).toBe("WHATSAPP");
    expect(created.data.respondentKey).toMatch(/^[0-9a-f]{64}$/);
    expect(created.data.respondentKey).not.toContain("5511999999999");
    expect(created.data.destinationMasked).not.toContain("11999999999");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "NPS_SURVEY_SEND",
        resource: "NpsSurvey",
        barbershopId: ACTIVE_SHOP.id,
        userId: "master-1",
      }),
    );
  });
});

describe("npsService.recordResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (cb: (tx: typeof txMock) => unknown) =>
      cb(txMock),
    );
  });

  it("retorna 404 para pesquisa inexistente", async () => {
    prismaMock.npsSurvey.findUnique.mockResolvedValue(null);
    await expect(
      recordResponse("00000000-0000-4000-8000-000000000099", { score: 9, lgpdAccepted: true }),
    ).rejects.toMatchObject({ statusCode: 404, code: "NPS_SURVEY_NOT_FOUND" });
  });

  it("retorna 409 quando a pesquisa já foi respondida", async () => {
    prismaMock.npsSurvey.findUnique.mockResolvedValue({
      id: "s1",
      barbershopId: "b1",
      status: "ANSWERED",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await expect(recordResponse("s1", { score: 9, lgpdAccepted: true })).rejects.toMatchObject({
      statusCode: 409,
      code: "NPS_ALREADY_ANSWERED",
    });
  });

  it("marca como EXPIRED e retorna 409 quando a pesquisa venceu", async () => {
    prismaMock.npsSurvey.findUnique.mockResolvedValue({
      id: "s1",
      barbershopId: "b1",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 1000),
    });
    prismaMock.npsSurvey.updateMany.mockResolvedValue({ count: 1 });

    await expect(recordResponse("s1", { score: 9, lgpdAccepted: true })).rejects.toMatchObject({
      statusCode: 409,
      code: "NPS_SURVEY_EXPIRED",
    });
    expect(prismaMock.npsSurvey.updateMany).toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("exige consentimento LGPD", async () => {
    prismaMock.npsSurvey.findUnique.mockResolvedValue({
      id: "s1",
      barbershopId: "b1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await expect(recordResponse("s1", { score: 9, lgpdAccepted: false })).rejects.toMatchObject({
      statusCode: 400,
      code: "LGPD_CONSENT_REQUIRED",
    });
  });

  it("registra a resposta e atualiza a pesquisa", async () => {
    prismaMock.npsSurvey.findUnique.mockResolvedValue({
      id: "s1",
      barbershopId: "b1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    txMock.npsResponse.create.mockResolvedValue({
      id: "r1",
      score: 8,
      comment: "Bom atendimento",
    });

    const result = await recordResponse("s1", {
      score: 8,
      comment: "  Bom atendimento  ",
      lgpdAccepted: true,
    });

    expect(result).toMatchObject({ surveyId: "s1", barbershopId: "b1", score: 8 });
    expect(txMock.npsResponse.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ score: 8, comment: "Bom atendimento" }),
      }),
    );
    expect(txMock.npsSurvey.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "ANSWERED", answeredAt: expect.any(Date) } }),
    );
  });
});

describe("npsService.npsSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("agrega promotores/passivos/detratores na janela de 90 dias", async () => {
    prismaMock.npsResponse.groupBy.mockResolvedValue([
      { score: 10, _count: { _all: 6 } },
      { score: 9, _count: { _all: 1 } },
      { score: 8, _count: { _all: 2 } },
      { score: 7, _count: { _all: 1 } },
      { score: 4, _count: { _all: 2 } },
      { score: 2, _count: { _all: 1 } },
    ]);

    const summary = await npsSummary();

    expect(summary).toEqual({
      windowDays: 90,
      responses: 13,
      promoters: 7,
      passives: 3,
      detractors: 3,
      score: Math.round(((7 - 3) / 13) * 100),
      insufficient: false,
    });
    expect(prismaMock.npsResponse.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["score"],
        where: expect.objectContaining({ createdAt: expect.objectContaining({ gte: expect.any(Date) }) }),
      }),
    );
  });

  it("marca como insuficiente abaixo de 10 respostas", async () => {
    prismaMock.npsResponse.groupBy.mockResolvedValue([{ score: 9, _count: { _all: 3 } }]);

    const summary = await npsSummary();

    expect(summary.insufficient).toBe(true);
    expect(summary.responses).toBe(3);
  });

  it("filtra por salão quando informado", async () => {
    prismaMock.npsResponse.groupBy.mockResolvedValue([]);

    await npsSummary("00000000-0000-4000-8000-000000000001");

    const call = prismaMock.npsResponse.groupBy.mock.calls[0][0] as {
      where: { barbershopId?: string };
    };
    expect(call.where.barbershopId).toBe("00000000-0000-4000-8000-000000000001");
  });
});

describe("npsService.getPublicSurvey", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expõe apenas nome do salão e contato mascarado", async () => {
    prismaMock.npsSurvey.findUnique.mockResolvedValue({
      id: "s1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 86_400_000),
      destinationMasked: "***99999",
      barbershop: { name: "Barbearia Central" },
    });

    const data = await getPublicSurvey("s1");
    expect(data).toMatchObject({
      shopName: "Barbearia Central",
      destinationMasked: "***99999",
      status: "PENDING",
    });
  });

  it("devolve EXPIRED para pesquisa pendente vencida", async () => {
    prismaMock.npsSurvey.findUnique.mockResolvedValue({
      id: "s1",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 1000),
      destinationMasked: "***99999",
      barbershop: { name: "Barbearia Central" },
    });

    const data = await getPublicSurvey("s1");
    expect(data.status).toBe("EXPIRED");
  });

  it("retorna 404 para pesquisa inexistente", async () => {
    prismaMock.npsSurvey.findUnique.mockResolvedValue(null);
    await expect(getPublicSurvey("nope")).rejects.toMatchObject({
      statusCode: 404,
      code: "NPS_SURVEY_NOT_FOUND",
    });
  });
});

describe("npsService.listSurveys", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pagina, filtra e devolve o score junto com a máscara", async () => {
    prismaMock.npsSurvey.count.mockResolvedValue(1);
    prismaMock.npsSurvey.findMany.mockResolvedValue([
      {
        id: "s1",
        barbershopId: "b1",
        destinationMasked: "***99999",
        channel: "WHATSAPP",
        status: "ANSWERED",
        sentAt: new Date("2026-10-01"),
        expiresAt: new Date("2026-10-16"),
        answeredAt: new Date("2026-10-03"),
        response: { score: 9 },
      },
    ]);

    const page = await listSurveys({
      barbershopId: "b1",
      status: "ANSWERED",
      page: 2,
      pageSize: 20,
    });

    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ id: "s1", score: 9, destinationMasked: "***99999" });
    expect(prismaMock.npsSurvey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
  });
});
