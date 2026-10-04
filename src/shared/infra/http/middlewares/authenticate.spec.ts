import { describe, it, expect, vi, beforeEach } from "vitest";
import { sign } from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import auth from "@/config/auth";
import { AppError } from "@/shared/errors/AppError";
import { authenticate } from "./authenticate";
import { checkSessionRevoked, touchSession } from "@/modules/auth/services/userSessionService";

vi.mock("@/modules/auth/services/userSessionService", () => ({
  checkSessionRevoked: vi.fn(),
  touchSession: vi.fn(),
}));

const reply = {} as FastifyReply;

function makeRequest(method: string, token?: string): FastifyRequest {
  return {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as unknown as FastifyRequest;
}

const masterToken = sign({ role: "MASTER_ADMIN" }, auth.secret, {
  subject: "8ab76d63-ea2d-4f64-8340-75a47dd51311",
  expiresIn: "5m",
});

const impersonationToken = sign(
  { role: "OWNER", barbershopId: "11111111-1111-4111-8111-111111111111", imp: true, impBy: "master-1" },
  auth.secret,
  { subject: "22222222-2222-4222-8222-222222222222", expiresIn: 1800 },
);

describe("authenticate — sessão de impersonation (somente leitura)", () => {
  it("GET com token de impersonation autentica o dono e marca impersonated", async () => {
    const request = makeRequest("GET", impersonationToken);
    await authenticate(request, reply);

    expect(request.user?.id).toBe("22222222-2222-4222-8222-222222222222");
    expect(request.user?.role).toBe("OWNER");
    expect(request.impersonated).toBe(true);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "%s com token de impersonation é recusado com 403",
    async (method) => {
      const request = makeRequest(method, impersonationToken);
      await expect(authenticate(request, reply)).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining("somente leitura"),
      });
    },
  );

  it("POST com token normal do master passa e não é marcado como impersonated", async () => {
    const request = makeRequest("POST", masterToken);
    await authenticate(request, reply);

    expect(request.user?.role).toBe("MASTER_ADMIN");
    expect(request.impersonated).toBe(false);
  });

  it("sem Authorization devolve 401", async () => {
    const request = makeRequest("GET");
    await expect(authenticate(request, reply)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("token inválido devolve 401", async () => {
    const request = makeRequest("GET", "token.burro.aqui");
    await expect(authenticate(request, reply)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("AppError do guard de escrita não é mascarado como 401", async () => {
    const request = makeRequest("POST", impersonationToken);
    const error = await authenticate(request, reply).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(AppError);
  });
});

describe("authenticate — checagem de sessão (claim sid)", () => {
  const sid = "33333333-3333-4333-8333-333333333333";

  const tokenWithSid = (role: string) =>
    sign({ role, sid }, auth.secret, {
      subject: "22222222-2222-4222-8222-222222222222",
      expiresIn: "5m",
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sessão revogada devolve 401 com mensagem de sessão encerrada", async () => {
    vi.mocked(checkSessionRevoked).mockResolvedValue("revoked");
    const request = makeRequest("GET", tokenWithSid("OWNER"));

    await expect(authenticate(request, reply)).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringContaining("Sessão encerrada"),
    });
    expect(touchSession).not.toHaveBeenCalled();
  });

  it("sessão ativa autentica, expõe o sid e agenda touch", async () => {
    vi.mocked(checkSessionRevoked).mockResolvedValue("active");
    const request = makeRequest("GET", tokenWithSid("OWNER"));

    await authenticate(request, reply);

    expect(request.user?.sid).toBe(sid);
    expect(touchSession).toHaveBeenCalledWith(sid);
  });

  it("estado desconhecido + MASTER_ADMIN falha fechada (401)", async () => {
    vi.mocked(checkSessionRevoked).mockResolvedValue("unknown");
    const request = makeRequest("GET", tokenWithSid("MASTER_ADMIN"));

    await expect(authenticate(request, reply)).rejects.toMatchObject({ statusCode: 401 });
  });

  it("estado desconhecido + OWNER falha aberta (autentica, sem touch)", async () => {
    vi.mocked(checkSessionRevoked).mockResolvedValue("unknown");
    const request = makeRequest("GET", tokenWithSid("OWNER"));

    await authenticate(request, reply);

    expect(request.user?.id).toBe("22222222-2222-4222-8222-222222222222");
    expect(touchSession).not.toHaveBeenCalled();
  });

  it("token antigo sem sid não consulta a sessão", async () => {
    const request = makeRequest("GET", masterToken);
    await authenticate(request, reply);

    expect(checkSessionRevoked).not.toHaveBeenCalled();
    expect(request.user?.sid).toBeUndefined();
  });
});
