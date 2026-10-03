import { describe, it, expect, beforeEach, vi } from "vitest";
import { verify } from "jsonwebtoken";
import auth from "@/config/auth";
import { AppError } from "@/shared/errors/AppError";
import { AdminAccountActionsController } from "./AdminAccountActionsController";

const prismaMock = vi.hoisted(() => ({
  barbershop: { findUnique: vi.fn(), update: vi.fn() },
  subscription: { findUnique: vi.fn(), update: vi.fn() },
  plan: { findUnique: vi.fn() },
  user: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
  adminNotification: { create: vi.fn() },
  blockedEntity: { findFirst: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
  Prisma: { TransactionClient: class {} },
}));

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const REASON = "Motivo válido com mais de dez caracteres";

function makeShop(overrides: Record<string, unknown> = {}) {
  return {
    id: SHOP_ID,
    name: "Barbearia Central",
    cnpj: "12345678000199",
    active: true,
    approvalStatus: "PENDING",
    rejectionReason: null,
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown> = {}) {
  return {
    params: { id: SHOP_ID },
    body: { reason: REASON, ...body },
    user: { id: "master-1", role: "MASTER_ADMIN" },
    ip: "127.0.0.1",
  };
}

function makeReply() {
  return { status: vi.fn().mockReturnThis(), send: vi.fn() } as never;
}

describe("AdminAccountActionsController", () => {
  let controller: AdminAccountActionsController;

  beforeEach(() => {
    controller = new AdminAccountActionsController();
    vi.clearAllMocks();
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.adminNotification.create.mockResolvedValue({});
    prismaMock.barbershop.update.mockResolvedValue({});
    prismaMock.subscription.update.mockResolvedValue({});
    prismaMock.blockedEntity.create.mockResolvedValue({});
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) =>
      fn(prismaMock),
    );
  });

  it("suspend: inativa, audita antes/depois e cria notificação crítica", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue(makeShop());

    await controller.suspend(makeRequest() as never, makeReply());

    expect(prismaMock.barbershop.update).toHaveBeenCalledWith({
      where: { id: SHOP_ID },
      data: { active: false },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ACCOUNT_SUSPEND",
          resourceId: SHOP_ID,
          ipAddress: "127.0.0.1",
        }),
      }),
    );
    expect(prismaMock.adminNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "ACCOUNT_ACTION" }),
      }),
    );
  });

  it("suspend: 409 quando a conta já está suspensa", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue(makeShop({ active: false }));

    await expect(controller.suspend(makeRequest() as never, makeReply())).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prismaMock.barbershop.update).not.toHaveBeenCalled();
  });

  it("suspend: motivo curto é rejeitado pelo schema", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue(makeShop());
    const request = { ...makeRequest(), body: { reason: "curto" } } as never;

    await expect(controller.suspend(request, makeReply())).rejects.toThrow();
    expect(prismaMock.barbershop.update).not.toHaveBeenCalled();
  });

  it("block: inativa, rejeita e registra o CNPJ bloqueado na transação", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue(makeShop());
    prismaMock.blockedEntity.findFirst.mockResolvedValue(null);

    await controller.block(makeRequest() as never, makeReply());

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.blockedEntity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "CNPJ", value: "12345678000199", barbershopId: SHOP_ID }),
      }),
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "ACCOUNT_BLOCK" }) }),
    );
  });

  it("block: sem CNPJ devolve 400 e não mexe na conta", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue(makeShop({ cnpj: null }));

    await expect(controller.block(makeRequest() as never, makeReply())).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("notifyOwner: cria comunicado interno ACCOUNT_ACTION e audita", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue(makeShop());

    const replyMock = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    const replyMockSend = replyMock.send;
    const result = await controller.notifyOwner(makeRequest() as never, replyMock as never);

    expect(prismaMock.adminNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ACCOUNT_ACTION",
          message: REASON,
        }),
      }),
    );
    expect(result).toBeUndefined();
    expect(replyMockSend).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: expect.objectContaining({ notified: true }) }),
    );
  });

  it("extendTrial: 409 quando a assinatura não está em trial", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue(makeShop());
    prismaMock.subscription.findUnique.mockResolvedValue({
      id: "sub-1",
      status: "ACTIVE",
      endDate: new Date("2026-11-01T00:00:00.000Z"),
    });

    await expect(
      controller.extendTrial(
        { ...makeRequest(), body: { reason: REASON, days: 7 } } as never,
        makeReply(),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it("changePlan: 400 para plano inativo ou inexistente", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue(makeShop());
    prismaMock.plan.findUnique.mockResolvedValue(null);
    const planId = "33333333-3333-4333-8333-333333333333";

    await expect(
      controller.changePlan(
        { ...makeRequest(), body: { reason: REASON, planId } } as never,
        makeReply(),
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.subscription.update).not.toHaveBeenCalled();
  });

  it("impersonate: emite JWT de 30min com imp=true para o dono ativo", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue(makeShop());
    prismaMock.user.findFirst.mockResolvedValue({
      id: OWNER_ID,
      name: "Dona Demo",
      email: "dona@demo.local",
      role: "OWNER",
      barbershopId: SHOP_ID,
      avatarUrl: null,
    });

    const replyMock = { status: vi.fn().mockReturnThis(), send: vi.fn() };
    await controller.impersonate(makeRequest() as never, replyMock as never);

    const sent = replyMock.send.mock.calls[0][0] as {
      data: { accessToken: string; expiresIn: number; user: { id: string; role: string } };
    };
    expect(sent.data.expiresIn).toBe(1800);
    expect(sent.data.user.role).toBe("OWNER");

    const decoded = verify(sent.data.accessToken, auth.secret) as {
      sub: string;
      imp?: boolean;
      exp: number;
    };
    expect(decoded.sub).toBe(OWNER_ID);
    expect(decoded.imp).toBe(true);
    expect(decoded.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(1800);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "ACCOUNT_IMPERSONATE" }) }),
    );
  });

  it("impersonate: 409 quando o salão não tem dono ativo", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue(makeShop());
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(controller.impersonate(makeRequest() as never, makeReply())).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prismaMock.adminNotification.create).not.toHaveBeenCalled();
  });

  it("impersonate: 409 quando a conta está inativa", async () => {
    prismaMock.barbershop.findUnique.mockResolvedValue(makeShop({ active: false }));

    await expect(controller.impersonate(makeRequest() as never, makeReply())).rejects.toBeInstanceOf(AppError);
  });
});
