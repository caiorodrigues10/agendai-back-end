import { describe, it, expect, beforeEach, vi } from "vitest";
import { GoogleLoginUseCase } from "./GoogleLoginUseCase";

const mockVerifyIdToken = vi.fn();

vi.mock("google-auth-library", () => {
  return {
    OAuth2Client: class {
      verifyIdToken = mockVerifyIdToken;
    },
  };
});

const prismaMock = vi.hoisted(() => ({
  user: { update: vi.fn().mockResolvedValue({}) },
  refreshToken: {
    deleteMany: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/libs/prismaClient", () => ({
  prisma: prismaMock,
}));

vi.mock("@/modules/subscriptions/utils/checkBarbershopAccess", () => ({
  checkBarbershopAccess: vi.fn().mockResolvedValue(undefined),
}));

const mockFindByEmail = vi.fn();

const mockUser = {
  id: "user-1",
  name: "Caio",
  email: "caio@test.com",
  role: "OWNER",
  barbershopId: "shop-1",
  cpf: "12345678901",
  active: true,
  googleSub: null,
  emailVerified: false,
  password: "$2b$10$hashedpassword",
  createdAt: new Date(),
};

describe("GoogleLoginUseCase", () => {
  let useCase: GoogleLoginUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    useCase = new GoogleLoginUseCase({ findByEmail: mockFindByEmail } as any);
  });

  it("deve rejeitar token Google inválido", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));

    await expect(useCase.execute("bad-token")).rejects.toThrow("Token Google inválido ou expirado");
  });

  it("deve rejeitar payload nulo do Google", async () => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => null });

    await expect(useCase.execute("token")).rejects.toThrow("E-mail não verificado pelo Google");
  });

  it("deve rejeitar e-mail não verificado pelo Google", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: false, sub: "sub-1" }),
    });

    await expect(useCase.execute("token")).rejects.toThrow("E-mail não verificado pelo Google");
  });

  it("deve retornar 404 quando e-mail não existe", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "sub-1" }),
    });
    mockFindByEmail.mockResolvedValue(null);

    await expect(useCase.execute("token")).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining("Conta não encontrada"),
        statusCode: 404,
      })
    );
  });

  it("deve retornar 404 quando user está inativo", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "sub-1" }),
    });
    mockFindByEmail.mockResolvedValue({ ...mockUser, active: false });

    await expect(useCase.execute("token")).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 })
    );
  });

  it("deve fazer login com sucesso e retornar tokens", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "sub-1" }),
    });
    mockFindByEmail.mockResolvedValue({ ...mockUser, emailVerified: true });

    const result = await useCase.execute("valid-token");

    expect(result).toHaveProperty("accessToken");
    expect(result).toHaveProperty("refreshToken");
    expect(result.user.email).toBe("caio@test.com");
  });

  it("deve persistir googleSub no primeiro login Google", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "google-sub-123" }),
    });
    mockFindByEmail.mockResolvedValue({ ...mockUser, emailVerified: true, googleSub: null });

    await useCase.execute("valid-token");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({ googleSub: "google-sub-123" }),
    });
  });

  it("deve marcar emailVerified true se ainda false", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "sub-1" }),
    });
    mockFindByEmail.mockResolvedValue({ ...mockUser, emailVerified: false, googleSub: null });

    await useCase.execute("valid-token");

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({ emailVerified: true, googleSub: "sub-1" }),
    });
  });

  it("não deve chamar update se googleSub e emailVerified já estão corretos", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "google-sub-123" }),
    });
    mockFindByEmail.mockResolvedValue({ ...mockUser, emailVerified: true, googleSub: "google-sub-123" });

    await useCase.execute("valid-token");

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
