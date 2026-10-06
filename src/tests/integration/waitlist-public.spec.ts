/// <reference types="vitest/globals" />
/**
 * Waitlist pública em integração (Fastify inject, sem HTTP real).
 *
 * Regressão do bug B18: o repositório apontava para os delegates legados
 * `waitlistEntry`/`waitlistOffer`, que não existem no cliente Prisma gerado,
 * transformando qualquer chamada em `TypeError` → 500 e derrubando o cron
 * `waitlist-expiration` a cada 5 minutos.
 *
 * Nenhum dado é criado aqui: só consultas por token inexistente e a expiração
 * de ofertas pendentes (updateMany sem correspondência).
 */
import type { FastifyInstance } from "fastify";

describe("Waitlist pública (integração)", () => {
  let app: FastifyInstance;
  let closeTestApp: (app: FastifyInstance) => Promise<void>;

  beforeAll(async () => {
    const helpers = await import("../helpers/createTestApp");
    closeTestApp = helpers.closeTestApp;
    app = await helpers.createTestApp();
  }, 180_000);

  afterAll(async () => {
    if (app && closeTestApp) await closeTestApp(app);
  });

  it("GET /api/appointments/waitlist/public/offer com token inválido → 404 (nunca 500)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/appointments/waitlist/public/offer?token=token-inexistente-qa",
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as { success: boolean; message?: string };
    expect(body.success).toBe(false);
  });

  it("POST /api/appointments/waitlist/public/accept com token inválido → 404 (nunca 500)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/appointments/waitlist/public/accept",
      payload: { token: "token-inexistente-qa" },
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as { success: boolean };
    expect(body.success).toBe(false);
  });

  it("POST /api/appointments/waitlist/public/decline com token inválido → 404 (nunca 500)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/appointments/waitlist/public/decline",
      payload: { token: "token-inexistente-qa" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("POST .../accept sem token → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/appointments/waitlist/public/accept",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("GET .../offer sem token → 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/appointments/waitlist/public/offer",
    });

    expect(res.statusCode).toBe(400);
  });

  it("cron waitlist-expiration executa sem erro", async () => {
    const { WaitlistUseCases } = await import("@/modules/waitlist/waitlistUseCases");
    const useCases = new WaitlistUseCases();

    const result = await useCases.runWaitlistExpiration();

    expect(result).toEqual({ expired: 0 });
  });
});
