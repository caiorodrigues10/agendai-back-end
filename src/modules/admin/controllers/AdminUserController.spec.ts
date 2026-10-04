/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AdminUserController } from "./AdminUserController";

const prismaMock = vi.hoisted(() => ({
  user: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
}));

vi.mock("@/libs/prismaClient", () => ({ prisma: prismaMock }));

const controller = new AdminUserController();

function makeReply() {
  return { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as any;
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    ip: "1.2.3.4",
    user: { id: "master-1", role: "MASTER_ADMIN" },
    ...overrides,
  } as never;
}

const MASTER_ID = "8ab76d63-ea2d-4f64-8340-75a47dd51311";
const OTHER_ID = "00000000-0000-4000-8000-0000000000aa";

describe("AdminUserController.update — invariantes do master", () => {
  beforeEach(() => vi.clearAllMocks());

  it("impede rebaixar o próprio papel", async () => {
    await expect(
      controller.update(
        makeRequest({
          params: { id: MASTER_ID },
          body: { role: "OWNER" },
          user: { id: MASTER_ID, role: "MASTER_ADMIN" },
        }),
        makeReply(),
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "SELF_ROLE_CHANGE" });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("impede desativar a própria conta", async () => {
    await expect(
      controller.update(
        makeRequest({
          params: { id: MASTER_ID },
          body: { active: false },
          user: { id: MASTER_ID, role: "MASTER_ADMIN" },
        }),
        makeReply(),
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "SELF_DEACTIVATE" });
  });

  it("impede rebaixar o último MASTER_ADMIN ativo", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: "MASTER_ADMIN", active: true });
    prismaMock.user.count.mockResolvedValue(0);

    await expect(
      controller.update(
        makeRequest({ params: { id: OTHER_ID }, body: { role: "OWNER" } }),
        makeReply(),
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "LAST_MASTER_ADMIN" });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("impede desativar o último MASTER_ADMIN ativo", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: "MASTER_ADMIN", active: true });
    prismaMock.user.count.mockResolvedValue(0);

    await expect(
      controller.update(
        makeRequest({ params: { id: OTHER_ID }, body: { active: false } }),
        makeReply(),
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "LAST_MASTER_ADMIN" });
  });

  it("permite rebaixar MASTER_ADMIN quando há outro ativo", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: "MASTER_ADMIN", active: true });
    prismaMock.user.count.mockResolvedValue(1);
    prismaMock.user.update.mockResolvedValue({
      id: OTHER_ID,
      name: "Outro",
      email: "outro@x.com",
      role: "OWNER",
      active: true,
      cpf: null,
      barbershopId: null,
    });

    const reply = makeReply();
    await controller.update(
      makeRequest({ params: { id: OTHER_ID }, body: { role: "OWNER" } }),
      reply,
    );

    expect(prismaMock.user.update).toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(200);
  });

  it("não consulta o último master quando a mudança não toca papel/ativo", async () => {
    prismaMock.user.update.mockResolvedValue({
      id: OTHER_ID,
      name: "Novo Nome",
      email: "x@y.com",
      role: "OWNER",
      active: true,
      cpf: null,
      barbershopId: null,
    });

    await controller.update(
      makeRequest({ params: { id: OTHER_ID }, body: { name: "Novo Nome" } }),
      makeReply(),
    );

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });
});

describe("AdminUserController.delete — invariantes do master", () => {
  beforeEach(() => vi.clearAllMocks());

  it("impede excluir a própria conta", async () => {
    await expect(
      controller.delete(
        makeRequest({ params: { id: MASTER_ID }, user: { id: MASTER_ID, role: "MASTER_ADMIN" } }),
        makeReply(),
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: "SELF_DELETE" });
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it("impede excluir o último MASTER_ADMIN ativo", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: "MASTER_ADMIN", active: true });
    prismaMock.user.count.mockResolvedValue(0);

    await expect(
      controller.delete(makeRequest({ params: { id: OTHER_ID } }), makeReply()),
    ).rejects.toMatchObject({ statusCode: 400, code: "LAST_MASTER_ADMIN" });
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it("exclui usuário comum com auditoria", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ role: "OWNER", active: true });
    prismaMock.user.delete.mockResolvedValue({ id: OTHER_ID, barbershopId: null });

    const reply = makeReply();
    await controller.delete(makeRequest({ params: { id: OTHER_ID } }), reply);

    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: OTHER_ID } });
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
    expect(reply.status).toHaveBeenCalledWith(200);
  });

  it("valida senha obrigatória no create via schema", async () => {
    await expect(
      controller.create(
        makeRequest({ body: { name: "Ana", email: "ana@x.com", role: "OWNER" } }),
        makeReply(),
      ),
    ).rejects.toThrow();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});

describe("AdminUserController.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pagina e devolve meta", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    const reply = makeReply();
    await controller.list(makeRequest({ query: { page: "1", limit: "20" } }), reply);

    expect(reply.status).toHaveBeenCalledWith(200);
    const payload = (reply.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      meta: { total: number };
    };
    expect(payload.meta.total).toBe(0);
  });
});
