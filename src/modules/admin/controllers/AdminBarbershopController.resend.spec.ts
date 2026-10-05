import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { AdminBarbershopController } from "./AdminBarbershopController";

const prismaMock = vi.hoisted(() => ({
  ownerInvite: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  barbershop: { findUnique: vi.fn() },
  user: { findFirst: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));

const enqueueEmailMock = vi.hoisted(() => vi.fn());

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock, Prisma: {} }));
vi.mock("@/shared/infra/queue/emailQueue", () => ({ enqueueEmail: enqueueEmailMock }));

function makeRequest() {
  return {
    params: { id: "shop-1" },
    user: { id: "master-user" },
    ip: "203.0.113.10",
  } as any;
}

function makeReply() {
  const reply = {
    status: vi.fn(),
    send: vi.fn(),
  };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply as any;
}

describe("AdminBarbershopController.resendInvite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enqueueEmailMock.mockResolvedValue(undefined);
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.barbershop.findUnique.mockResolvedValue({ name: "Barbearia Teste" });
    prismaMock.user.findFirst.mockResolvedValue({ name: "Dono Teste" });
    prismaMock.ownerInvite.update.mockResolvedValue({});
    prismaMock.ownerInvite.create.mockResolvedValue({ id: "invite-2", email: "dono@teste.com" });
  });

  it("revokes the previous invite, creates a new token and returns inviteSent=true", async () => {
    prismaMock.ownerInvite.findFirst.mockResolvedValue({
      id: "invite-1",
      barbershopId: "shop-1",
      email: "dono@teste.com",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1000),
    });

    const controller = new AdminBarbershopController();
    const reply = makeReply();
    await controller.resendInvite(makeRequest(), reply);

    expect(prismaMock.ownerInvite.update).toHaveBeenCalledWith({
      where: { id: "invite-1" },
      data: expect.objectContaining({ status: "REVOKED" }),
    });

    const createdData = prismaMock.ownerInvite.create.mock.calls[0][0].data;
    expect(createdData.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    // O token do e-mail é outro valor: hash do link = tokenHash persistido.
    const inviteUrl: string = enqueueEmailMock.mock.calls[0][0].inviteUrl;
    const rawToken = inviteUrl.split("/convite/")[1];
    expect(createHash("sha256").update(rawToken).digest("hex")).toBe(createdData.tokenHash);

    expect(reply.send).toHaveBeenCalledWith({ success: true, data: { inviteSent: true } });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "OWNER_INVITE_RESEND" }),
    });
    const sentPayload = JSON.stringify(enqueueEmailMock.mock.calls[0][0]);
    expect(prismaMock.ownerInvite.create).toHaveBeenCalled();
    expect(sentPayload).toContain("/convite/");
  });

  it("returns 404 when the shop has no owner invite", async () => {
    prismaMock.ownerInvite.findFirst.mockResolvedValue(null);

    const controller = new AdminBarbershopController();
    await expect(controller.resendInvite(makeRequest(), makeReply())).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(prismaMock.ownerInvite.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the invite was already accepted", async () => {
    prismaMock.ownerInvite.findFirst.mockResolvedValue({
      id: "invite-1",
      email: "dono@teste.com",
      status: "ACCEPTED",
      expiresAt: new Date(Date.now() + 1000),
    });

    const controller = new AdminBarbershopController();
    await expect(controller.resendInvite(makeRequest(), makeReply())).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prismaMock.ownerInvite.create).not.toHaveBeenCalled();
  });

  it("still returns 200 with inviteSent=false when the e-mail queue fails", async () => {
    prismaMock.ownerInvite.findFirst.mockResolvedValue({
      id: "invite-1",
      email: "dono@teste.com",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1000),
    });
    enqueueEmailMock.mockRejectedValueOnce(new Error("queue down"));

    const controller = new AdminBarbershopController();
    const reply = makeReply();
    await controller.resendInvite(makeRequest(), reply);

    expect(reply.send).toHaveBeenCalledWith({ success: true, data: { inviteSent: false } });
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});
