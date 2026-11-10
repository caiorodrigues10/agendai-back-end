/// <reference types="vitest/globals" />
/**
 * Auditoria Google Auth — contrato dos CONTROLLERS (não do use case).
 *
 * Cobre dois achados desta verificação, como teste de regressão do estado
 * ATUAL (nenhuma correção de produção aplicada):
 *
 * 1. KNOWN GAP — falha do /auth/google é gravada como LOGIN_FAILED genérico,
 *    sem statusCode nem code: no AccessLog não dá para separar 401 (token) de
 *    404 (conta inexistente) nem contar 404/429/5xx.
 * 2. KNOWN GAP — o /auth/register-google não tem try/catch: quando o use case
 *    lança AppError (400 e-mail já cadastrado, 409 CPF, 401 token…) o
 *    logAccess do caminho de sucesso nunca roda e a falha fica invisível.
 *
 * O lockout (checkLock/recordFailure/resetAttempts) é só de LoginController.ts
 * — ver src/modules/auth/useCases/login/LoginController.ts:18,25,41.
 * GoogleLoginController.ts não importa bruteForceProtection (grep comprova).
 */
import type { FastifyReply, FastifyRequest } from "fastify";

const executeMock = vi.fn();
const logAccessMock = vi.fn();

vi.mock("tsyringe", async importOriginal => {
  const actual = await importOriginal<typeof import("tsyringe")>();
  return {
    ...actual,
    container: { resolve: () => ({ execute: executeMock }) },
  };
});

vi.mock("@/shared/services/accessLogService", () => ({
  logAccess: (params: unknown) => logAccessMock(params),
}));

// O controller só resolve o use case via container (mockado acima), mas o
// import do módulo puxa prismaClient/checkBarbershopAccess — sem DATABASE_URL
// no ambiente de teste o import do arquivo inteiro quebraria.
vi.mock("@/libs/prismaClient", () => ({ prisma: {} }));

import { GoogleLoginController } from "./GoogleLoginController";
import { RegisterGoogleController } from "../registerGoogle/RegisterGoogleController";
import { AppError } from "@/shared/errors/AppError";

function makeRequest() {
  return {
    body: { idToken: "fake-google-id-token" },
    ip: "203.0.113.7",
    headers: { "user-agent": "vitest" },
    log: { error: vi.fn() },
  } as unknown as FastifyRequest;
}

function makeReply() {
  const reply = {
    statusCode: 0,
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    send: vi.fn(),
  };
  return reply as unknown as FastifyReply & { statusCode: number };
}

describe("GoogleLoginController (auditoria)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sucesso grava GOOGLE_LOGIN com success=true", async () => {
    executeMock.mockResolvedValue({ user: { id: "u1" }, accessToken: "at" });
    const reply = makeReply();

    await new GoogleLoginController().handle(makeRequest(), reply);

    expect(logAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "GOOGLE_LOGIN", success: true, userId: "u1" })
    );
    expect(reply.statusCode).toBe(200);
  });

  // KNOWN GAP: o catch não propaga statusCode/code para o AccessLog.
  it("KNOWN GAP: falha grava LOGIN_FAILED sem statusCode nem code", async () => {
    executeMock.mockRejectedValue(
      new AppError("Conta não encontrada. Cadastre-se normalmente com e-mail e senha.", 404)
    );
    const reply = makeReply();

    await expect(new GoogleLoginController().handle(makeRequest(), reply)).rejects.toThrow(
      expect.objectContaining({ statusCode: 404 })
    );

    expect(logAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LOGIN_FAILED", success: false })
    );
    const logged = logAccessMock.mock.calls[0][0] as Record<string, unknown>;
    expect(logged).not.toHaveProperty("statusCode");
    expect(logged).not.toHaveProperty("code");
  });

  it("erro não-AppError vira 500 sem vazar o original", async () => {
    executeMock.mockRejectedValue(new Error("boom: detalhe interno"));
    const reply = makeReply();

    await expect(new GoogleLoginController().handle(makeRequest(), reply)).rejects.toThrow(
      expect.objectContaining({ statusCode: 500, message: "Falha ao autenticar com Google" })
    );
  });
});

describe("RegisterGoogleController (auditoria)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sucesso grava REGISTER_GOOGLE com success=true", async () => {
    executeMock.mockResolvedValue({ user: { id: "u1", email: "x@y.z" } });
    const reply = makeReply();

    await new RegisterGoogleController().handle(makeRequest(), reply);

    expect(logAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "REGISTER_GOOGLE", success: true })
    );
    expect(reply.statusCode).toBe(201);
  });

  // KNOWN GAP: sem try/catch, a exceção aborta antes do logAccess de sucesso
  // e nenhum log de falha é escrito — cadastro Google recusado não aparece.
  it("KNOWN GAP: falha do cadastro Google não escreve AccessLog", async () => {
    executeMock.mockRejectedValue(new AppError("E-mail já cadastrado", 409));
    const reply = makeReply();

    await expect(new RegisterGoogleController().handle(makeRequest(), reply)).rejects.toThrow(
      expect.objectContaining({ statusCode: 409 })
    );

    expect(logAccessMock).not.toHaveBeenCalled();
  });
});
