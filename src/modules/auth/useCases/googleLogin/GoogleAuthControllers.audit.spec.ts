/// <reference types="vitest/globals" />
/**
 * Auditoria Google Auth — contrato dos CONTROLLERS (não do use case).
 *
 * Achados desta verificação:
 *
 * 1. CORRIGIDO (item 1): a recusa por googleSub divergente grava AccessLog com
 *    action própria (GOOGLE_SUB_MISMATCH) e o code interno é removido antes da
 *    resposta — o cliente vê um 401 genérico. As demais falhas continuam como
 *    LOGIN_FAILED genérico, sem statusCode nem code (KNOWN GAP: no AccessLog
 *    não dá para separar 401 de 404 nem contar 429/5xx).
 * 2. KNOWN GAP — o /auth/register-google não tem try/catch: quando o use case
 *    lança AppError (400 e-mail já cadastrado, 409 CPF, 401 token…) o
 *    logAccess do caminho de sucesso nunca roda e a falha fica invisível.
 *
 * Lockout por conta (item 5): o use case aplica checkLock/recordFailure/
 * resetAttempts (mesmo mecanismo do LoginController) e o controller repassa o
 * 423 sem gravar AccessLog — igual ao login por senha, em que o bloqueio não
 * é uma tentativa nova.
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

  // Item 1: googleSub divergente → AccessLog com action própria e o code
  // interno NÃO chega ao cliente (401 genérico, sem revelar o motivo).
  it("sub divergente grava GOOGLE_SUB_MISMATCH e devolve 401 sem o code", async () => {
    executeMock.mockRejectedValue(
      new AppError("Credenciais inválidas", 401, undefined, "GOOGLE_SUB_MISMATCH")
    );
    const reply = makeReply();

    const thrown = await new GoogleLoginController()
      .handle(makeRequest(), reply)
      .catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(AppError);
    const err = thrown as AppError;
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Credenciais inválidas");
    // Sinal interno removido na fronteira: nem `code` nem `errors` saem na
    // resposta (handleAppError só serializa message/statusCode/errors/code).
    expect(err.code).toBeUndefined();
    expect(err.errors).toBeUndefined();

    expect(logAccessMock).toHaveBeenCalledTimes(1);
    expect(logAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "GOOGLE_SUB_MISMATCH", success: false })
    );
  });

  // Item 5: conta bloqueada (423) não grava AccessLog — o bloqueio não é uma
  // tentativa nova (mesmo comportamento do LoginController.ts).
  it("conta bloqueada (423) não grava AccessLog", async () => {
    executeMock.mockRejectedValue(
      new AppError(
        "Conta bloqueada por múltiplas tentativas. Tente novamente em 60 segundos.",
        423
      )
    );
    const reply = makeReply();

    await expect(new GoogleLoginController().handle(makeRequest(), reply)).rejects.toThrow(
      expect.objectContaining({ statusCode: 423 })
    );

    expect(logAccessMock).not.toHaveBeenCalled();
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
