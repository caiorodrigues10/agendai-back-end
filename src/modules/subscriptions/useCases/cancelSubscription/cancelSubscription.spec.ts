import { describe, it, expect, beforeEach, vi } from "vitest";
import { CancelSubscriptionController } from "./CancelSubscriptionController";

const prismaMock = vi.hoisted(() => ({
  subscription: { findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("@/modules/referrals/services/referralService", () => ({
  revokeReferralOnCancellation: vi.fn().mockResolvedValue(undefined),
  qualifyReferralOnPayment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/shared/infra/http/middlewares/subscriptionAccessCache", () => ({
  invalidateSubscriptionCache: vi.fn(),
}));

const issueProratedRefundMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock("@/modules/payments/services/proratedRefundService", () => ({
  issueProratedRefund: issueProratedRefundMock,
}));

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    barbershopId: "shop-1",
    planId: "plan-1",
    status: "ACTIVE",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-02-01T00:00:00.000Z"),
    cancelDate: null,
    cancelReason: null,
    referralCreditDays: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    plan: { id: "plan-1", name: "Pro" },
    ...overrides,
  };
}

describe("CancelSubscriptionController — cancelReason", () => {
  let controller: CancelSubscriptionController;
  let reply: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new CancelSubscriptionController();
    reply = { send: vi.fn() };
    prismaMock.subscription.findUnique.mockResolvedValue(
      makeSubscription()
    );
    prismaMock.subscription.update.mockImplementation((args: any) =>
      Promise.resolve(
        makeSubscription({
          status: "CANCELED",
          cancelDate: new Date(),
          ...(args?.data ?? {}),
        })
      )
    );
    prismaMock.auditLog.create.mockResolvedValue({});
  });

  it("grava cancelReason no update quando body informa motivo", async () => {
    const request = {
      user: { id: "user-1", role: "OWNER", barbershopId: "shop-1" },
      body: { cancelReason: "price" },
      ip: "127.0.0.1",
    } as any;

    await controller.handle(request, reply as any);

    const subUpdateCall = prismaMock.subscription.update.mock.calls.find(
      (c) => c[0].where?.id === "sub-1"
    );
    expect(subUpdateCall).toBeTruthy();
    expect(subUpdateCall![0].data.status).toBe("CANCELED");
    expect(subUpdateCall![0].data.cancelDate).toBeInstanceOf(Date);
    expect(subUpdateCall![0].data.cancelReason).toBe("price");

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ cancelReason: "price" }),
      })
    );
  });

  it("funciona sem body (DELETE sem payload)", async () => {
    const request = {
      user: { id: "user-1", role: "OWNER", barbershopId: "shop-1" },
      body: undefined,
      ip: "127.0.0.1",
    } as any;

    await controller.handle(request, reply as any);

    const subUpdateCall = prismaMock.subscription.update.mock.calls.find(
      (c) => c[0].where?.id === "sub-1"
    );
    expect(subUpdateCall![0].data.cancelReason).toBeNull();
    expect(reply.send).toHaveBeenCalled();
  });

  it("rejeita cancelReason inválido", async () => {
    const request = {
      user: { id: "user-1", role: "OWNER", barbershopId: "shop-1" },
      body: { cancelReason: "not_a_reason" },
      ip: "127.0.0.1",
    } as any;

    await expect(
      controller.handle(request, reply as any)
    ).rejects.toThrow();
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it("mantém 409 quando assinatura já está CANCELED", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(
      makeSubscription({ status: "CANCELED", cancelDate: new Date() })
    );

    const request = {
      user: { id: "user-1", role: "OWNER", barbershopId: "shop-1" },
      body: {},
      ip: "127.0.0.1",
    } as any;

    await expect(
      controller.handle(request, reply as any)
    ).rejects.toThrow("já está cancelada");
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it("mantém 404 quando não existe assinatura", async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);

    const request = {
      user: { id: "user-1", role: "OWNER", barbershopId: "shop-1" },
      body: {},
      ip: "127.0.0.1",
    } as any;

    await expect(
      controller.handle(request, reply as any)
    ).rejects.toThrow("Nenhuma assinatura");
  });

  it("repassa pixKey/pixKeyType para o reembolso proporcional automático", async () => {
    const request = {
      user: { id: "user-1", role: "OWNER", barbershopId: "shop-1" },
      body: {
        cancelReason: "price",
        pixKey: "cliente@email.com",
        pixKeyType: "EMAIL",
      },
      ip: "127.0.0.1",
    } as any;

    await controller.handle(request, reply as any);

    expect(issueProratedRefundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        barbershopId: "shop-1",
        cancelReason: "price",
        pixKey: "cliente@email.com",
        pixKeyType: "EMAIL",
      })
    );
  });

  it("resposta inclui proratedRefund quando o reembolso é emitido", async () => {
    issueProratedRefundMock.mockResolvedValue({
      refundId: "refund-1",
      amount: 167,
      status: "SUCCEEDED",
      reason: "Reembolso proporcional automático (price)",
    });

    const request = {
      user: { id: "user-1", role: "OWNER", barbershopId: "shop-1" },
      body: { cancelReason: "price", pixKey: "x", pixKeyType: "CPF" },
      ip: "127.0.0.1",
    } as any;

    await controller.handle(request, reply as any);

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          proratedRefund: { refundId: "refund-1", amount: 167, status: "SUCCEEDED", reason: "Reembolso proporcional automático (price)" },
        }),
      })
    );
  });

  it("rejeita pixKeyType inválido", async () => {
    const request = {
      user: { id: "user-1", role: "OWNER", barbershopId: "shop-1" },
      body: { pixKeyType: "NAO_EXISTE" },
      ip: "127.0.0.1",
    } as any;

    await expect(
      controller.handle(request, reply as any)
    ).rejects.toThrow();
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });
});