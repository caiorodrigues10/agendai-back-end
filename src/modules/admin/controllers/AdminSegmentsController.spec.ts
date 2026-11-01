import { describe, it, expect, beforeEach, vi } from "vitest";
import { AppError } from "@/shared/errors/AppError";
import { AdminSegmentsController } from "./AdminSegmentsController";

const prismaMock = vi.hoisted(() => ({
  barbershop: {
    findUnique: vi.fn(),
    update: vi.fn(),
    groupBy: vi.fn(),
  },
  product: { count: vi.fn() },
  equipment: { count: vi.fn() },
  commissionEntry: { count: vi.fn() },
  cashMovement: { count: vi.fn() },
  salonClient: { count: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
  Prisma: { TransactionClient: class {} },
}));

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const REASON = "Motivo válido com mais de dez caracteres";

function makeRequest(body: Record<string, unknown> = {}) {
  return {
    params: { id: SHOP_ID },
    body: { segment: "LAW_FIRM", reason: REASON, ...body },
    user: { id: "master-1", role: "MASTER_ADMIN" },
    ip: "127.0.0.1",
  };
}

function makeReply() {
  return { status: vi.fn().mockReturnThis(), send: vi.fn() } as never;
}

function makeShop(overrides: Record<string, unknown> = {}) {
  return {
    id: SHOP_ID,
    name: "Barbearia Central",
    businessSegment: "BARBERSHOP",
    businessSegmentOther: null,
    targetAudience: "MASCULINO",
    ...overrides,
  };
}

describe("AdminSegmentsController", () => {
  let controller: AdminSegmentsController;

  beforeEach(() => {
    controller = new AdminSegmentsController();
    vi.clearAllMocks();
    prismaMock.barbershop.update.mockResolvedValue({});
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.product.count.mockResolvedValue(0);
    prismaMock.equipment.count.mockResolvedValue(0);
    prismaMock.commissionEntry.count.mockResolvedValue(0);
    prismaMock.cashMovement.count.mockResolvedValue(0);
    prismaMock.salonClient.count.mockResolvedValue(0);
  });

  describe("list", () => {
    it("devolve o catálogo com a contagem de salões por segmento", async () => {
      prismaMock.barbershop.groupBy.mockResolvedValue([
        { businessSegment: "BARBERSHOP", _count: { _all: 3 } },
        { businessSegment: "LAW_FIRM", _count: { _all: 1 } },
      ]);

      const reply = makeReply();
      await controller.list({} as never, reply);

      const payload = (reply as unknown as { send: { mock: { calls: unknown[][] } } }).send.mock
        .calls[0][0] as {
        data: Array<{ segment: string; shops: number; hiddenModules: string[] }>;
      };

      expect(payload.data).toHaveLength(23);
      const barber = payload.data.find((item) => item.segment === "BARBERSHOP");
      expect(barber?.shops).toBe(3);
      expect(barber?.hiddenModules).toEqual([]);
      const law = payload.data.find((item) => item.segment === "LAW_FIRM");
      expect(law?.shops).toBe(1);
      expect(law?.hiddenModules).toEqual([
        "products",
        "equipment",
        "commissions",
        "tip",
      ]);
    });
  });

  describe("updateSegment", () => {
    it("troca o segmento e audita valor anterior e novo", async () => {
      prismaMock.barbershop.findUnique.mockResolvedValue(makeShop());

      await controller.updateSegment(makeRequest() as never, makeReply());

      expect(prismaMock.barbershop.update).toHaveBeenCalledWith({
        where: { id: SHOP_ID },
        data: {
          businessSegment: "LAW_FIRM",
          businessSegmentOther: null,
          targetAudience: null,
        },
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "ACCOUNT_CHANGE_SEGMENT",
            resourceId: SHOP_ID,
            details: expect.stringContaining('"segment":"LAW_FIRM"'),
          }),
        }),
      );
    });

    it("bloqueia a troca quando o salão já está no segmento", async () => {
      prismaMock.barbershop.findUnique.mockResolvedValue(
        makeShop({ businessSegment: "LAW_FIRM" }),
      );

      await expect(
        controller.updateSegment(makeRequest() as never, makeReply()),
      ).rejects.toBeInstanceOf(AppError);
      expect(prismaMock.barbershop.update).not.toHaveBeenCalled();
    });

    it("exige confirmação explícita quando há dados incompatíveis", async () => {
      prismaMock.barbershop.findUnique.mockResolvedValue(makeShop());
      prismaMock.product.count.mockResolvedValue(3);
      prismaMock.salonClient.count.mockResolvedValue(5);

      const error = await controller
        .updateSegment(makeRequest() as never, makeReply())
        .catch((err: unknown) => err as AppError);

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(409);
      expect((error as AppError).code).toBe("SEGMENT_CHANGE_REQUIRES_CONFIRMATION");
      expect(prismaMock.barbershop.update).not.toHaveBeenCalled();
    });

    it("aplica a troca quando a confirmação é enviada", async () => {
      prismaMock.barbershop.findUnique.mockResolvedValue(makeShop());
      prismaMock.product.count.mockResolvedValue(3);
      prismaMock.salonClient.count.mockResolvedValue(5);

      await controller.updateSegment(
        makeRequest({ confirm: true }) as never,
        makeReply(),
      );

      expect(prismaMock.barbershop.update).toHaveBeenCalled();
      expect(prismaMock.auditLog.create).toHaveBeenCalled();
    });

    it("rejeita segmento fora do catálogo", async () => {
      await expect(
        controller.updateSegment(
          makeRequest({ segment: "BARBEARIA" }) as never,
          makeReply(),
        ),
      ).rejects.toThrow();
      expect(prismaMock.barbershop.update).not.toHaveBeenCalled();
    });

    it("exige motivo com pelo menos 10 caracteres", async () => {
      await expect(
        controller.updateSegment(
          makeRequest({ reason: "curto" }) as never,
          makeReply(),
        ),
      ).rejects.toThrow();
      expect(prismaMock.barbershop.update).not.toHaveBeenCalled();
    });
  });
});
