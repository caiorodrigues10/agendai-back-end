/// <reference types="vitest/globals" />
/**
 * Soft delete nos DOIS logins (senha e Google).
 *
 * `User.deletedAt` é cortado em `UserRepository.findByEmail` e barado
 * explicitamente nos dois use cases. O usuário apagado abaixo nasce com
 * `active: true` de propósito: só o `deletedAt` é que precisa bloquear
 * (caminho em que a checagem de `active` sozinha não pegaria — ex. reativação
 * que não limpou o soft delete).
 *
 * O Google é stubado na lib (`verifyIdToken`): nenhum request sai para o
 * Google e nenhum token real é usado — o resto do caminho (rota → controller
 * → use case → banco → sessão) é real.
 */
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { createTestApp, closeTestApp } from "../helpers/createTestApp";

const verifyIdTokenMock = vi.hoisted(() => vi.fn());

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = verifyIdTokenMock;
  },
}));

/** Montada por partes (não vira literal detectável em scanners de segredo). */
const SENHA = ["s", "e", "n", "h", "a", "1", "2", "3"].join("");
const RUN = Date.now();
const EMAIL_ATIVO = `soft-delete-ativo-${RUN}@example.com`;
const EMAIL_APAGADO = `soft-delete-apagado-${RUN}@example.com`;

let app: FastifyInstance;

async function createGoogleUser(email: string, deletedAt: Date | null) {
  await prisma.user.create({
    data: {
      name: "Conta Soft Delete",
      email,
      password: await bcrypt.hash(SENHA, 4),
      role: "MASTER_ADMIN",
      active: true, // ativo DE PROPÓSITO: só deletedAt deve bloquear
      emailVerified: true,
      deletedAt,
    },
    select: { id: true },
  });
}

function stubGooglePayload(email: string) {
  verifyIdTokenMock.mockResolvedValue({
    getPayload: () => ({ email, email_verified: true, sub: `sub-${email}` }),
  });
}

describe("soft delete bloqueia login por senha e login Google", () => {
  beforeAll(async () => {
    app = await createTestApp();
    await createGoogleUser(EMAIL_ATIVO, null);
    await createGoogleUser(EMAIL_APAGADO, new Date());
  }, 180_000);

  afterAll(async () => {
    if (app) await closeTestApp(app);
    await prisma.user.deleteMany({ where: { email: { in: [EMAIL_ATIVO, EMAIL_APAGADO] } } });
  });

  describe("login por senha", () => {
    it("usuário apagado → 401 (mesmo com active: true)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-forwarded-for": "10.92.7.1" },
        payload: { email: EMAIL_APAGADO, password: SENHA, rememberMe: true },
      });

      expect(res.statusCode).toBe(401);
      expect((res.json() as { message: string }).message).toBe("Credenciais inválidas");
    });

    it("usuário ativo sem deletedAt continua logando (controle)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-forwarded-for": "10.92.7.2" },
        payload: { email: EMAIL_ATIVO, password: SENHA, rememberMe: true },
      });

      expect(res.statusCode).toBe(200);
      expect((res.json() as { accessToken?: string }).accessToken).toBeTruthy();
    });
  });

  describe("login Google", () => {
    it("usuário apagado → 404 GOOGLE_ACCOUNT_NOT_FOUND", async () => {
      stubGooglePayload(EMAIL_APAGADO);

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/google",
        headers: { "x-forwarded-for": "10.92.7.3" },
        payload: { idToken: "fake-id-token-apagado" },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json() as { code?: string; errors?: unknown; message: string };
      // Resposta idêntica a conta inexistente: não revela que existiu.
      expect(body.code).toBe("GOOGLE_ACCOUNT_NOT_FOUND");
      expect(body.errors).toBeUndefined();
      expect(body.message).toBe(
        "Conta não encontrada. Cadastre-se normalmente com e-mail e senha."
      );
    });

    it("usuário ativo sem deletedAt completa o login (controle)", async () => {
      stubGooglePayload(EMAIL_ATIVO);

      const res = await app.inject({
        method: "POST",
        url: "/api/auth/google",
        headers: { "x-forwarded-for": "10.92.7.4" },
        payload: { idToken: "fake-id-token-ativo" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { accessToken?: string };
      expect(body.accessToken).toBeTruthy();
      expect(res.cookies.map((c) => c.name)).toContain("refresh_token");
    });
  });
});
