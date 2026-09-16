import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDeleteMany = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    refreshToken: {
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
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
  });

  it("keeps revokeAllSessions as the global session revocation path", async () => {
    mockDeleteMany.mockResolvedValue({ count: 2 });

    const count = await useCase.revokeAllSessions("user-1");

    expect(count).toBe(2);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });
});
