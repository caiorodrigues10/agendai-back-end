/// <reference types="vitest/globals" />
/**
 * Prova de retrocompatibilidade da política de senha.
 *
 * A política (8+ caracteres, 1 letra e 1 número) vale só para a DEFINIÇÃO de
 * senha. Contas antigas — com senha de 6 caracteres — precisam continuar
 * entrando: por isso o login segue sem política.
 *
 * Este teste cria a conta direto no banco (como birthday de um usuário real
 * criado antes da mudança) e faz login pela rota HTTP.
 */
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { createTestApp, closeTestApp } from "../helpers/createTestApp";

/** Senha legada: 6 caracteres, sem política — montada por partes. */
const SENHA_LEGADA = ["a", "b", "c", "1", "2", "3"].join("");
const RUN = Date.now();
const EMAIL_LEGADO = `senha-legada-${RUN}@example.com`;
const EMAIL_NOVO = `senha-nova-${RUN}@example.com`;

let app: FastifyInstance;

describe("senha existente de 6 caracteres continua funcionando", () => {
  beforeAll(async () => {
    app = await createTestApp();
    await prisma.user.create({
      data: {
        name: "Conta Legada",
        email: EMAIL_LEGADO,
        password: await bcrypt.hash(SENHA_LEGADA, 4),
        role: "MASTER_ADMIN",
        active: true,
        emailVerified: true,
      },
      select: { id: true },
    });
  }, 180_000);

  afterAll(async () => {
    if (app) await closeTestApp(app);
    await prisma.user.deleteMany({ where: { email: { in: [EMAIL_LEGADO, EMAIL_NOVO] } } });
  });

  it("login com a senha de 6 caracteres → 200 + tokens", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "x-forwarded-for": "10.91.7.1" },
      payload: { email: EMAIL_LEGADO, password: SENHA_LEGADA, rememberMe: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { accessToken?: string; user?: { email: string } };
    expect(body.accessToken).toBeTruthy();
    expect(body.user?.email).toBe(EMAIL_LEGADO);
    // O refresh vai em cookie HttpOnly (`refresh_token`), não no corpo.
    expect(res.cookies.map((c) => c.name)).toContain("refresh_token");
  });

  it("login com a senha errada → 401 (a senha antiga continua valendo)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "x-forwarded-for": "10.91.7.2" },
      payload: { email: EMAIL_LEGADO, password: `errada${456}`, rememberMe: false },
    });

    expect(res.statusCode).toBe(401);
  });

  it("cadastro com senha de 6 caracteres → 400 (a política vale na definição)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      headers: { "x-forwarded-for": "10.91.7.3" },
      payload: {
        ownerName: "Dona de Salão",
        email: EMAIL_NOVO,
        password: SENHA_LEGADA,
        cpf: "11144477735",
        barbershopName: "Barbearia da Política",
        whatsapp: "11999998888",
        termsVersion: "1.0",
        termsAccepted: true,
        lgpdConsent: true,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { errors?: Array<{ field: string; message: string }> };
    const senhaErro = body.errors?.find((e) => e.field === "password");
    expect(senhaErro?.message).toContain("8 caracteres");
  });
});
