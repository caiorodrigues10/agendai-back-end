import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcceptOwnerInviteUseCase } from "./AcceptOwnerInviteUseCase";

const prismaMock = vi.hoisted(() => ({
  ownerInvite: { findUnique: vi.fn(), updateMany: vi.fn() },
  user: { findFirst: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock, Prisma: {} }));

const hashProvider = { hash: vi.fn().mockResolvedValue("hashed-new-password") };
const VALID_TOKEN = "a".repeat(64);
const future = () => new Date(Date.now() + 60 * 60 * 1000);

function pendingInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    barbershopId: "shop-1",
    email: "dono@teste.com",
    invitedById: "master-user",
    status: "PENDING",
    expiresAt: future(),
    acceptedAt: null,
    ...overrides,
  };
}

describe("AcceptOwnerInviteUseCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hashProvider.hash.mockResolvedValue("hashed-new-password");
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.user.update.mockResolvedValue({ id: "owner-1" });
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        ownerInvite: prismaMock.ownerInvite,
        user: prismaMock.user,
      }),
    );
  });

  it("accepts the invite atomically and sets the owner password", async () => {
    prismaMock.ownerInvite.findUnique.mockResolvedValue(pendingInvite());
    prismaMock.ownerInvite.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findFirst.mockResolvedValue({ id: "owner-1" });

    const useCase = new AcceptOwnerInviteUseCase(hashProvider as any);
    const result = await useCase.execute(VALID_TOKEN, "NovaSenha123");

    expect(result).toEqual({ message: "Senha definida com sucesso" });
    expect(prismaMock.ownerInvite.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect(prismaMock.ownerInvite.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "invite-1", status: "PENDING" }),
      data: expect.objectContaining({ status: "ACCEPTED" }),
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "owner-1" },
      data: { password: "hashed-new-password", emailVerified: true, active: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "owner-1",
        action: "OWNER_INVITE_ACCEPT",
        barbershopId: "shop-1",
      }),
    });
  });

  it("rejects an unknown token with the generic message (no existence leak)", async () => {
    prismaMock.ownerInvite.findUnique.mockResolvedValue(null);

    const useCase = new AcceptOwnerInviteUseCase(hashProvider as any);
    await expect(useCase.execute(VALID_TOKEN, "NovaSenha123")).rejects.toMatchObject({
      statusCode: 400,
      message: "Link inválido ou expirado. Solicite um novo convite.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an expired invite with the same generic message", async () => {
    prismaMock.ownerInvite.findUnique.mockResolvedValue(
      pendingInvite({ expiresAt: new Date(Date.now() - 1000) }),
    );

    const useCase = new AcceptOwnerInviteUseCase(hashProvider as any);
    await expect(useCase.execute(VALID_TOKEN, "NovaSenha123")).rejects.toMatchObject({
      statusCode: 400,
      message: "Link inválido ou expirado. Solicite um novo convite.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an already accepted invite with the same generic message", async () => {
    prismaMock.ownerInvite.findUnique.mockResolvedValue(
      pendingInvite({ status: "ACCEPTED", acceptedAt: new Date() }),
    );

    const useCase = new AcceptOwnerInviteUseCase(hashProvider as any);
    await expect(useCase.execute(VALID_TOKEN, "NovaSenha123")).rejects.toMatchObject({
      statusCode: 400,
      message: "Link inválido ou expirado. Solicite um novo convite.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("does not set the password when the atomic claim fails (single use)", async () => {
    prismaMock.ownerInvite.findUnique.mockResolvedValue(pendingInvite());
    prismaMock.ownerInvite.updateMany.mockResolvedValue({ count: 0 });

    const useCase = new AcceptOwnerInviteUseCase(hashProvider as any);
    await expect(useCase.execute(VALID_TOKEN, "NovaSenha123")).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("rolls back when the owner user is missing (claim undone)", async () => {
    prismaMock.ownerInvite.findUnique.mockResolvedValue(pendingInvite());
    prismaMock.ownerInvite.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findFirst.mockResolvedValue(null);

    const useCase = new AcceptOwnerInviteUseCase(hashProvider as any);
    await expect(useCase.execute(VALID_TOKEN, "NovaSenha123")).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});
