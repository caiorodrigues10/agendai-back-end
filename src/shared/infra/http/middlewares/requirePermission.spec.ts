/// <reference types="vitest/globals" />

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
}));

import { requirePermission } from "./requirePermission";

function call(perms: Parameters<typeof requirePermission>, user: unknown) {
  const middleware = requirePermission(...perms);
  return middleware({ user } as any, {} as any);
}

describe("requirePermission", () => {
  beforeEach(() => {
    mocks.userFindUnique.mockReset();
  });

  it("bloqueia sem usuário autenticado (401)", async () => {
    await expect(call(["QUEUE_MANAGE"], undefined)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("OWNER passa sem consulta ao banco", async () => {
    await expect(
      call(["QUEUE_MANAGE"], { id: "u1", role: "OWNER" })
    ).resolves.toBeUndefined();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("MASTER_ADMIN passa sem consulta ao banco", async () => {
    await expect(
      call(["QUEUE_MANAGE"], { id: "u1", role: "MASTER_ADMIN" })
    ).resolves.toBeUndefined();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("aceita permissão vinda do token quando o claim existe", async () => {
    await expect(
      call(["QUEUE_MANAGE"], { id: "u1", role: "EMPLOYEE", permissions: ["QUEUE_MANAGE"] })
    ).resolves.toBeUndefined();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("hidrata do banco quando o token não carrega permissões", async () => {
    mocks.userFindUnique.mockResolvedValue({ permissions: ["QUEUE_MANAGE"] });
    await expect(call(["QUEUE_MANAGE"], { id: "u1", role: "EMPLOYEE" })).resolves.toBeUndefined();
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { permissions: true },
    });
  });

  it("nega EMPLOYEE sem a permissão (403)", async () => {
    mocks.userFindUnique.mockResolvedValue({ permissions: ["FINANCE_VIEW"] });
    await expect(
      call(["QUEUE_MANAGE"], { id: "u1", role: "EMPLOYEE" })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("nega EMPLOYEE sem registro de permissões na base", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    await expect(
      call(["QUEUE_MANAGE"], { id: "u1", role: "EMPLOYEE" })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("CUSTOMER nunca passa por permissão de funcionário", async () => {
    mocks.userFindUnique.mockResolvedValue({ permissions: [] });
    await expect(
      call(["QUEUE_MANAGE"], { id: "u1", role: "CUSTOMER" })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
