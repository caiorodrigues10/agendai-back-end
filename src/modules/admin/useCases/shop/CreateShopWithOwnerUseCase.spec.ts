import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { CreateShopWithOwnerUseCase } from "./CreateShopWithOwnerUseCase";

const prismaMock = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  plan: { findFirst: vi.fn() },
  barbershop: { create: vi.fn() },
  ownerInvite: { create: vi.fn() },
  subscription: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  adminNotification: { create: vi.fn() },
  $transaction: vi.fn(),
}));

const enqueueEmailMock = vi.hoisted(() => vi.fn());
const checkCnpjAccessMock = vi.hoisted(() => vi.fn());
const seedDefaultsMock = vi.hoisted(() => vi.fn());

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock, Prisma: {} }));
vi.mock("@/shared/infra/queue/emailQueue", () => ({ enqueueEmail: enqueueEmailMock }));
vi.mock("@/modules/subscriptions/utils/checkBarbershopAccess", () => ({
  checkCnpjAccess: checkCnpjAccessMock,
}));
vi.mock("@/shared/utils/seedBarbershopDefaults", () => ({
  seedBarbershopDefaults: seedDefaultsMock,
}));

const hashProvider = { hash: vi.fn().mockResolvedValue("hashed-placeholder") };
const actor = { id: "master-user", ip: "203.0.113.10" };
const PLAN_ID = "00000000-0000-4000-8000-000000000001";

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Barbearia Teste",
    whatsapp: "11999990000",
    address: "Rua das Flores, 100",
    active: true,
    owner: { name: "Dono Teste", email: "dono@teste.com" },
    planId: PLAN_ID,
    trialDays: 45,
    ...overrides,
  } as any;
}

describe("CreateShopWithOwnerUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hashProvider.hash.mockResolvedValue("hashed-placeholder");
    checkCnpjAccessMock.mockResolvedValue(undefined);
    seedDefaultsMock.mockResolvedValue(undefined);
    enqueueEmailMock.mockResolvedValue(undefined);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.plan.findFirst.mockResolvedValue({ id: PLAN_ID });
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.adminNotification.create.mockResolvedValue({});
    prismaMock.barbershop.create.mockResolvedValue({ id: "shop-1", name: "Barbearia Teste" });
    prismaMock.user.create.mockResolvedValue({ id: "owner-1" });
    prismaMock.ownerInvite.create.mockResolvedValue({ id: "invite-1" });
    prismaMock.subscription.create.mockResolvedValue({ id: "sub-1" });
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        barbershop: prismaMock.barbershop,
        user: prismaMock.user,
        ownerInvite: prismaMock.ownerInvite,
        subscription: prismaMock.subscription,
        seedBarbershopDefaults: seedDefaultsMock,
      }),
    );
  });

  it("creates shop, owner, invite and trial in one transaction and enqueues invite after commit", async () => {
    const useCase = new CreateShopWithOwnerUseCase(hashProvider as any);
    const result = await useCase.execute(actor, baseInput());

    expect(prismaMock.barbershop.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Barbearia Teste",
        whatsapp: "11999990000",
        address: "Rua das Flores, 100",
        active: true,
        approvalStatus: "APPROVED",
      }),
    });
    expect(seedDefaultsMock).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "dono@teste.com",
        role: "OWNER",
        barbershopId: "shop-1",
        password: "hashed-placeholder",
        emailVerified: false,
      }),
    });
    expect(prismaMock.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        barbershopId: "shop-1",
        planId: PLAN_ID,
        status: "TRIALING",
      }),
    });

    // Token bruto só no link do e-mail; no banco fica apenas o hash SHA-256.
    const inviteUrl: string = enqueueEmailMock.mock.calls[0][0].inviteUrl;
    const rawToken = inviteUrl.split("/convite/")[1];
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    const expectedHash = createHash("sha256").update(rawToken).digest("hex");
    expect(prismaMock.ownerInvite.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tokenHash: expectedHash }),
    });

    // Nenhum campo de auditoria contém o token bruto.
    const auditDetails = prismaMock.auditLog.create.mock.calls
      .map((c: any[]) => JSON.stringify(c[0].data.details ?? ""))
      .join("");
    expect(auditDetails).not.toContain(rawToken);

    const actions = prismaMock.auditLog.create.mock.calls.map((c: any[]) => c[0].data.action);
    expect(actions).toEqual([
      "CREATE_BARBERSHOP",
      "CREATE_SHOP_OWNER",
      "CREATE_SHOP_SUBSCRIPTION",
      "OWNER_INVITE_SEND",
    ]);

    expect(result.inviteSent).toBe(true);
    expect(result.owner).toEqual({ id: "owner-1", email: "dono@teste.com" });
    expect(result.subscription).toMatchObject({ planId: PLAN_ID, status: "TRIALING" });

    // trialDays = 45 → endDate ~ agora + 45 dias (não o padrão de 30).
    const trialEnd = (result.subscription as any).trialEnd as Date;
    const expected = Date.now() + 45 * 24 * 60 * 60 * 1000;
    expect(Math.abs(trialEnd.getTime() - expected)).toBeLessThan(5_000);
  });

  it("returns inviteSent=false when enqueueEmail fails, without undoing the creation", async () => {
    enqueueEmailMock.mockRejectedValueOnce(new Error("redis down"));

    const useCase = new CreateShopWithOwnerUseCase(hashProvider as any);
    const result = await useCase.execute(actor, baseInput());

    expect(result.inviteSent).toBe(false);
    expect(result.owner).toBeDefined();
    expect(prismaMock.barbershop.create).toHaveBeenCalledTimes(1);
    const actions = prismaMock.auditLog.create.mock.calls.map((c: any[]) => c[0].data.action);
    expect(actions).not.toContain("OWNER_INVITE_SEND");
    expect(prismaMock.adminNotification.create).toHaveBeenCalled();
  });

  it("rejects with 409 when the owner e-mail already exists", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "existing-user" });

    const useCase = new CreateShopWithOwnerUseCase(hashProvider as any);
    await expect(useCase.execute(actor, baseInput())).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects with 400 when the plan does not exist or is inactive", async () => {
    prismaMock.plan.findFirst.mockResolvedValue(null);

    const useCase = new CreateShopWithOwnerUseCase(hashProvider as any);
    await expect(useCase.execute(actor, baseInput())).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("creates shop without owner or subscription when optional fields are absent", async () => {
    const useCase = new CreateShopWithOwnerUseCase(hashProvider as any);
    const result = await useCase.execute(actor, baseInput({ owner: undefined, planId: undefined, trialDays: undefined }));

    expect(result.owner).toBeUndefined();
    expect(result.subscription).toBeUndefined();
    expect(result.inviteSent).toBe(false);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.ownerInvite.create).not.toHaveBeenCalled();
    expect(prismaMock.subscription.create).not.toHaveBeenCalled();
    expect(enqueueEmailMock).not.toHaveBeenCalled();
    expect(prismaMock.barbershop.create).toHaveBeenCalledTimes(1);
  });

  it("checks cnpj access before opening the transaction", async () => {
    const useCase = new CreateShopWithOwnerUseCase(hashProvider as any);
    await useCase.execute(actor, baseInput({ cnpj: "11222333000181" }));

    expect(checkCnpjAccessMock).toHaveBeenCalledWith("11222333000181");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
