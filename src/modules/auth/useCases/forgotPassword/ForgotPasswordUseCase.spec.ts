/// <reference types="vitest/globals" />

const mockFindFirst = vi.fn();
const mockUpdateMany = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/libs/prismaClient", () => ({
  prisma: {
    user: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
    },
    passwordResetToken: {
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
      create: (...a: unknown[]) => mockCreate(...a),
    },
  },
}));

const mockEnqueueEmail = vi.fn().mockResolvedValue(undefined);

vi.mock("@/shared/infra/queue", () => ({
  enqueueEmail: (...a: unknown[]) => mockEnqueueEmail(...a),
  enqueueWhatsApp: vi.fn().mockResolvedValue(undefined),
}));

const mockIncr = vi.fn();
const mockExpire = vi.fn();

vi.mock("@/shared/infra/queue/redisConnection", () => ({
  getRedisConnection: () => ({ incr: mockIncr, expire: mockExpire }),
  getApiRedisConnection: () => ({ incr: mockIncr, expire: mockExpire }),
}));

import { ForgotPasswordUseCase } from "./ForgotPasswordUseCase";

describe("ForgotPasswordUseCase — Redis indisponível (B4/P0-13: fail-closed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recusa a solicitação com 503 quando o rate limit não pode ser verificado", async () => {
    mockIncr.mockRejectedValue(new Error("ECONNREFUSED"));

    const useCase = new ForgotPasswordUseCase();

    await expect(useCase.execute("user@test.com", "1.2.3.4")).rejects.toMatchObject({
      statusCode: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
    });
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockEnqueueEmail).not.toHaveBeenCalled();
  });

  it("consulta o usuário e emite token quando o Redis está saudável", async () => {
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(true);
    mockFindFirst.mockResolvedValue({ id: "u1", email: "user@test.com", active: true });
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockCreate.mockResolvedValue({ id: "pr1" });
    mockEnqueueEmail.mockResolvedValue(undefined);

    const useCase = new ForgotPasswordUseCase();

    await expect(useCase.execute("user@test.com", "1.2.3.4")).resolves.toMatchObject({
      message: expect.stringContaining("Se o e-mail existir"),
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
  });
});
