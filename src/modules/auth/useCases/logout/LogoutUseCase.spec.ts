/// <reference types="vitest/globals" />

const mockDeleteMany = vi.fn();
const mockSessionFindUnique = vi.fn();
const mockSessionFindMany = vi.fn();
const mockSessionUpdate = vi.fn();
const mockSessionUpdateMany = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    refreshToken: {
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
    userSession: {
      findUnique: (...args: unknown[]) => mockSessionFindUnique(...args),
      findMany: (...args: unknown[]) => mockSessionFindMany(...args),
      update: (...args: unknown[]) => mockSessionUpdate(...args),
      updateMany: (...args: unknown[]) => mockSessionUpdateMany(...args),
    },
  },
}));

import { LogoutUseCase } from "./LogoutUseCase";

describe("LogoutUseCase", () => {
  let useCase: LogoutUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new LogoutUseCase();
  });

  it("revokes only the presented refresh token on regular logout", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });

    const count = await useCase.execute("user-1", "refresh-token-device-a");

    expect(count).toBe(1);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", token: "refresh-token-device-a", purpose: "session" },
    });
  });

  it("does not revoke every session when the current refresh token is unavailable", async () => {
    const count = await useCase.execute("user-1");

    expect(count).toBe(0);
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(mockSessionFindUnique).not.toHaveBeenCalled();
  });

  it("revokes the UserSession of the current sid but keeps the remembered device", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });
    mockSessionFindUnique.mockResolvedValue({
      id: "sid-1",
      userId: "user-1",
      revokedAt: null,
      refreshTokenId: "rt-1",
      rememberedTokenId: "rm-1",
    });
    mockSessionUpdate.mockResolvedValue({});

    await useCase.execute("user-1", "refresh-token-device-a", "sid-1");

    expect(mockSessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sid-1" },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
    // Só o token de sessão é apagado; o dispositivo lembrado permanece salvo.
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["rt-1"] } } });
  });

  it("ignores a sid that belongs to another user's session", async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 });
    mockSessionFindUnique.mockResolvedValue({
      id: "sid-1",
      userId: "someone-else",
      revokedAt: null,
      refreshTokenId: "rt-1",
      rememberedTokenId: "rm-1",
    });

    await useCase.execute("user-1", "refresh-token-device-a", "sid-1");

    expect(mockSessionUpdate).not.toHaveBeenCalled();
  });

  it("revokes all sessions and tokens on global revocation", async () => {
    mockSessionFindMany.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
    mockSessionUpdateMany.mockResolvedValue({ count: 2 });
    mockDeleteMany.mockResolvedValue({ count: 3 });

    const result = await useCase.revokeAllSessions("user-1");

    expect(result).toEqual({ tokens: 3, sessions: 2 });
    expect(mockSessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1", revokedAt: null } }),
    );
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });
});
