/// <reference types="vitest/globals" />
// GOOGLE_CLIENT_ID é lido no TOPO do módulo (GoogleLoginUseCase.ts:11), na
// avaliação do import. `vi.hoisted` roda antes dos imports; sem ele o
// `process.env.GOOGLE_CLIENT_ID` do beforeEach seria tarde demais e todos os
// testes validariam audience "" sem perceber. A lib google-auth-library só
// valida a audience quando ela não é undefined/null (oauth2client.js:775), então
// o valor capturado no import é o que decide se o token é aceito.
vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
});
import { GoogleLoginUseCase } from "./GoogleLoginUseCase";
import { AppError } from "@/shared/errors/AppError";
import { checkBarbershopAccess } from "@/modules/subscriptions/utils/checkBarbershopAccess";

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
  userSession: {
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
    // Primeiro login NÃO vincula googleSub sem email_verified === true: o
    // check acontece antes do lookup e nenhuma escrita é feita no usuário.
    expect(prismaMock.user.update).not.toHaveBeenCalled();
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

  // ─── audience / validação do token ────────────────────────────────────────

  it("envia GOOGLE_CLIENT_ID como audience do verifyIdToken", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "sub-1" }),
    });
    mockFindByEmail.mockResolvedValue({ ...mockUser, emailVerified: true, googleSub: "sub-1" });

    await useCase.execute("valid-token");

    // audience undefined/null faria a lib PULAR a checagem (oauth2client.js:775).
    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: "valid-token",
      audience: "test-client-id",
    });
  });

  it("audience divergente (Wrong recipient) vira 401, não 500", async () => {
    mockVerifyIdToken.mockRejectedValue(
      new Error("Wrong recipient, payload audience != requiredAudience")
    );

    await expect(useCase.execute("valid-token")).rejects.toThrow(
      expect.objectContaining({
        statusCode: 401,
        message: "Token Google inválido ou expirado",
      })
    );
  });

  it("token expirado/inválido vira 401 com código explícito ausente (só message)", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("Token used too early or expired"));

    await expect(useCase.execute("expired")).rejects.toThrow(
      expect.objectContaining({ statusCode: 401, code: undefined })
    );
  });

  it("payload sem e-mail vira 401 (E-mail não verificado pelo Google)", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: "sub-1", email_verified: true }),
    });

    await expect(useCase.execute("token")).rejects.toThrow(
      expect.objectContaining({ statusCode: 401, message: "E-mail não verificado pelo Google" })
    );
  });

  // Corrigido (item 2): o código vai para o 4o parâmetro do AppError (code) —
  // AppError(message, statusCode, errors?, code?). O handler app.ts serializa
  // `code` na resposta, então o branch do front
  // `err.code === 'GOOGLE_ACCOUNT_NOT_FOUND'` (AuthContext.ts:238) dispara e a
  // orientação em PT-BR chega ao usuário (antes o código cru aparecia na tela).
  it("GOOGLE_ACCOUNT_NOT_FOUND vai em `code`, não em `errors`", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "sub-1" }),
    });
    mockFindByEmail.mockResolvedValue(null);

    await expect(useCase.execute("token")).rejects.toThrow(
      expect.objectContaining({
        statusCode: 404,
        message: "Conta não encontrada. Cadastre-se normalmente com e-mail e senha.",
        code: "GOOGLE_ACCOUNT_NOT_FOUND",
        errors: undefined,
      })
    );
  });

  // ─── identidade: e-mail, sub, soft delete ─────────────────────────────────

  it("e-mail com maiúsculas é repassado cru ao findByEmail (a normalização é do repositório)", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "CAIO@Test.COM", email_verified: true, sub: "sub-1" }),
    });
    mockFindByEmail.mockResolvedValue({ ...mockUser, emailVerified: true, googleSub: "sub-1" });

    await useCase.execute("token");

    // UserRepository.findByEmail faz trim().toLowerCase() + mode:"insensitive"
    // (UserRepository.ts:66-71); o use case não normaliza.
    expect(mockFindByEmail).toHaveBeenCalledWith("CAIO@Test.COM");
  });

  it("sub IGUAL ao googleSub gravado entra sem regravar nada", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "google-sub-123" }),
    });
    mockFindByEmail.mockResolvedValue({
      ...mockUser,
      emailVerified: true,
      googleSub: "google-sub-123",
    });

    const result = await useCase.execute("token");

    expect(result).toHaveProperty("accessToken");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  // Corrigido (item 1 da correção do login Google): com googleSub já gravado,
  // payload.sub diferente é recusado. Um token Google válido de OUTRA conta
  // Google com o mesmo e-mail verificado não abre mais a conta.
  it("sub DIFERENTE do googleSub gravado é recusado com 401 genérico", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: "caio@test.com",
        email_verified: true,
        sub: "outro-sub-google",
      }),
    });
    mockFindByEmail.mockResolvedValue({
      ...mockUser,
      emailVerified: true,
      googleSub: "google-sub-original",
    });

    // Mensagem genérica (igual a credencial errada) — o motivo não vaza.
    // `code` é o sinal interno que o controller transforma em AccessLog e
    // remove antes de responder ao cliente.
    await expect(useCase.execute("token")).rejects.toThrow(
      expect.objectContaining({
        statusCode: 401,
        message: "Credenciais inválidas",
        code: "GOOGLE_SUB_MISMATCH",
      })
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  // Corrigido (item 3): soft delete corta os DOIS logins. findByEmail filtra
  // `deletedAt` no repositório e o use case também barra explicitamente — um
  // usuário apagado responde como conta inexistente (404), sem revelar que
  // existiu.
  it("usuário com deletedAt preenchido é recusado com 404", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "sub-1" }),
    });
    mockFindByEmail.mockResolvedValue({
      ...mockUser,
      emailVerified: true,
      googleSub: "sub-1",
      deletedAt: new Date(),
    });

    await expect(useCase.execute("token")).rejects.toThrow(
      expect.objectContaining({
        statusCode: 404,
        code: "GOOGLE_ACCOUNT_NOT_FOUND",
      })
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  // ─── restrições de acesso e sessão ────────────────────────────────────────

  it("barbearia com CPF bloqueado propaga o erro de checkBarbershopAccess (402)", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "sub-1" }),
    });
    mockFindByEmail.mockResolvedValue({ ...mockUser, emailVerified: true, googleSub: "sub-1" });
    vi.mocked(checkBarbershopAccess).mockRejectedValueOnce(
      new AppError("Assinatura vencida", 402, undefined, "SUBSCRIPTION_REQUIRED")
    );

    await expect(useCase.execute("token")).rejects.toThrow(
      expect.objectContaining({ statusCode: 402, code: "SUBSCRIPTION_REQUIRED" })
    );
  });

  it("sem barbearia (owner sem loja) não chama checkBarbershopAccess", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "sub-1" }),
    });
    mockFindByEmail.mockResolvedValue({
      ...mockUser,
      barbershopId: null,
      emailVerified: true,
      googleSub: "sub-1",
    });

    await useCase.execute("token");

    expect(checkBarbershopAccess).not.toHaveBeenCalled();
  });

  it("emite a sessão com cookies idênticos aos do login por senha", async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "sub-1" }),
    });
    mockFindByEmail.mockResolvedValue({ ...mockUser, emailVerified: true, googleSub: "sub-1" });
    const setCookie = vi.fn();

    await useCase.execute("token", { setCookie } as never, { ip: "127.0.0.1" });

    const session = setCookie.mock.calls.find(([name]) => name === "refresh_token");
    const remembered = setCookie.mock.calls.find(([name]) =>
      String(name).startsWith("saved_refresh_")
    );

    // getAuthCookieSecurityOptions() fora de produção: SameSite=Lax, sem Secure.
    // O Google força rememberMe=true (GoogleLoginUseCase.ts:91) → maxAge presente.
    expect(session?.[2]).toEqual(
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/api/auth",
        maxAge: 30 * 24 * 60 * 60,
      })
    );
    expect(remembered?.[2]).toEqual(
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/api/auth",
        maxAge: 30 * 24 * 60 * 60,
      })
    );
  });

  it("em produção o cookie vira SameSite=None + Secure + Partitioned", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email: "caio@test.com", email_verified: true, sub: "sub-1" }),
      });
      mockFindByEmail.mockResolvedValue({ ...mockUser, emailVerified: true, googleSub: "sub-1" });
      const setCookie = vi.fn();

      await useCase.execute("token", { setCookie } as never);

      const session = setCookie.mock.calls.find(([name]) => name === "refresh_token");
      expect(session?.[2]).toEqual(
        expect.objectContaining({ sameSite: "none", secure: true, partitioned: true })
      );
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
