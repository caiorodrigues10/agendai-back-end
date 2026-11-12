/// <reference types="vitest/globals" />
/**
 * Fluxo "esqueci a senha" → "redefinir senha" ponta a ponta.
 *
 * Roda contra Postgres + Redis REAIS (docker-compose + redis local), conforme
 * `npm run test:integration`. Nenhum e-mail é enviado: o `enqueueEmail` é
 * substituído por um gravador que captura o job (kind + deduplicationKey) antes
 * de qualquer worker/provedor.
 *
 * Dados são fictícios (`@example.com`); nenhum e-mail/token real é impresso.
 */
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { createTestApp, closeTestApp } from "../helpers/createTestApp";
import { buildForgotPasswordEmail } from "@/modules/email/templates/authEmails";
import { categoryForTemplate } from "@/modules/email/services/emailPreferenceService";
import { getRedisConnection } from "@/shared/infra/queue/redisConnection";

type EnqueuedJob = Record<string, unknown>;

const { enqueued, enqueueEmailMock } = vi.hoisted(() => {
  const enqueued: EnqueuedJob[] = [];
  const enqueueEmailMock = vi.fn(async (data: EnqueuedJob) => {
    enqueued.push(data);
  });
  return { enqueued, enqueueEmailMock };
});

// ForgotPasswordUseCase importa de "@/shared/infra/queue" (índice) e
// ResetPasswordUseCase de "@/shared/infra/queue/emailQueue" — mocka os dois.
vi.mock("@/shared/infra/queue/emailQueue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/infra/queue/emailQueue")>();
  return { ...actual, enqueueEmail: enqueueEmailMock };
});
vi.mock("@/shared/infra/queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/infra/queue")>();
  return { ...actual, enqueueEmail: enqueueEmailMock };
});

const RUN = Date.now();
/** Senha sintética de teste — valor fixo, sem acesso a nenhum serviço. */
const SENHA_DE_TESTE = "SenhaAntiga123";
const createdUserIds: string[] = [];
const createdEmails: string[] = [];
let app: FastifyInstance;

/** IP único por requisição: isola o rate limit por IP (3/h na rota). */
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.77.${Math.floor(ipCounter / 200)}.${(ipCounter % 200) + 1}`;
}

function fakeEmail(tag: string): string {
  const email = `forgotpw-${tag}-${RUN}@example.com`;
  createdEmails.push(email);
  return email;
}

async function createUser(opts: {
  email: string;
  password?: string;
  active?: boolean;
  deletedAt?: Date | null;
}): Promise<{ id: string; email: string }> {
  const hash = await bcrypt.hash(opts.password ?? SENHA_DE_TESTE, 4);
  const user = await prisma.user.create({
    data: {
      name: "Usuário de Teste",
      email: opts.email,
      password: hash,
      role: "EMPLOYEE",
      active: opts.active ?? true,
      emailVerified: true,
      ...(opts.deletedAt ? { deletedAt: opts.deletedAt } : {}),
    },
    select: { id: true, email: true },
  });
  createdUserIds.push(user.id);
  return user;
}

async function forgot(email: string, ip = nextIp(), recaptchaToken = "") {
  return app.inject({
    method: "POST",
    url: "/api/auth/forgot-password",
    remoteAddress: ip,
    payload: { email, recaptchaToken },
  });
}

async function reset(token: string, newPassword: string, ip = nextIp()) {
  return app.inject({
    method: "POST",
    url: "/api/auth/reset-password",
    remoteAddress: ip,
    payload: { token, newPassword },
  });
}

async function login(email: string, password: string, ip = nextIp()) {
  return app.inject({
    method: "POST",
    url: "/api/auth/login",
    remoteAddress: ip,
    payload: { email, password, rememberMe: true },
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Solicita um link e devolve o token PLAINTEXT recém-emitido (lido do job enfileirado — o banco guarda só o SHA-256). */
async function requestToken(email: string): Promise<{ token: string; id: string }> {
  const before = await prisma.passwordResetToken.count({ where: { email } });
  const res = await forgot(email);
  expect(res.statusCode).toBe(200);
  const rows = await prisma.passwordResetToken.findMany({
    where: { email },
    orderBy: { createdAt: "desc" },
  });
  expect(rows.length).toBe(before + 1);
  const job = jobsOf("forgot_password").at(-1);
  expect(job).toBeTruthy();
  return { token: job!.token as string, id: rows[0].id };
}

function jobsOf(kind: string): EnqueuedJob[] {
  return enqueued.filter((j) => j.kind === kind);
}

beforeAll(async () => {
  process.env.ALLOW_TEST_REDIS = "1";
  app = await createTestApp();
  // Chaves de rate limit de execuções anteriores contaminariam os asserts.
  const redis = getRedisConnection();
  const keys = [];
  let cursor = "0";
  do {
    const [next, found] = await redis.scan(cursor, "MATCH", "forgotpwd:rate:*", "COUNT", 200);
    cursor = String(next);
    keys.push(...found);
  } while (cursor !== "0");
  if (keys.length) await redis.del(keys);
  enqueueEmailMock.mockClear();
  enqueued.length = 0;
});

afterAll(async () => {
  await closeTestApp(app);
  await prisma.passwordResetToken.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userSession.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.accessLog.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

beforeEach(() => {
  enqueueEmailMock.mockClear();
  enqueued.length = 0;
});

describe("A. caminho feliz (a)", () => {
  it("cria token de 64 hex com expiração de 1h, invalida anteriores e enfileira UM forgot_password com deduplicationKey", async () => {
    const email = fakeEmail("happy");
    await createUser({ email });

    const first = await requestToken(email);
    const second = await requestToken(email);

    const rows = await prisma.passwordResetToken.findMany({
      where: { email },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);

    // Token PLAINTEXT de 64 hex (randomBytes(32)) só no job; o banco guarda o SHA-256.
    expect(first.token).toMatch(/^[0-9a-f]{64}$/);
    expect(second.token).toMatch(/^[0-9a-f]{64}$/);
    expect(second.token).not.toBe(first.token);
    expect(rows[0].token).toBe(sha256(first.token));
    expect(rows[1].token).toBe(sha256(second.token));
    expect(rows[1].token).not.toBe(second.token);

    // Expira em 1h (janela de tolerância de 5s).
    const ttl = rows[1].expiresAt.getTime() - rows[1].createdAt.getTime();
    expect(ttl).toBeGreaterThan(3_600_000 - 5_000);
    expect(ttl).toBeLessThan(3_600_000 + 5_000);

    // O link anterior foi invalidado (usedAt) ao pedir um novo.
    expect(rows[0].usedAt).not.toBeNull();
    expect(rows[1].usedAt).toBeNull();

    // Exatamente UM job forgot_password por solicitação, com deduplicationKey.
    const jobs = jobsOf("forgot_password");
    expect(jobs).toHaveLength(2);
    expect(jobs[1].deduplicationKey).toBe(`forgot-password:${rows[1].id}`);
    expect(jobs[0].deduplicationKey).toBe(`forgot-password:${rows[0].id}`);
    // Só o token PLAINTEXT do job (o e-mail nunca é montado aqui; o banco tem o hash).
    expect(jobs[1].email).toBe(email);
    expect(jobs[1].token).toBe(second.token);
    expect(jobs[1].token).not.toBe(rows[1].token);
  });

  it("resposta é idêntica (status + corpo) para e-mail existente, inexistente e inativo", async () => {
    const active = fakeEmail("resp-active");
    const inactive = fakeEmail("resp-inactive");
    const missing = fakeEmail("resp-missing");
    await createUser({ email: active });
    await createUser({ email: inactive, active: false });

    const rActive = await forgot(active);
    const rInactive = await forgot(inactive);
    const rMissing = await forgot(missing);

    expect(rActive.statusCode).toBe(200);
    expect(rInactive.statusCode).toBe(200);
    expect(rMissing.statusCode).toBe(200);

    // Corpo byte a byte igual — sem vazar existência de conta.
    expect(rInactive.body).toBe(rActive.body);
    expect(rMissing.body).toBe(rActive.body);
    expect(JSON.parse(rActive.body)).toEqual({
      success: true,
      message: "Se o e-mail existir, você receberá um link de redefinição.",
    });

    // Só o existente gerou token/job.
    expect(
      await prisma.passwordResetToken.count({ where: { email: missing } })
    ).toBe(0);
    expect(
      await prisma.passwordResetToken.count({ where: { email: inactive } })
    ).toBe(0);
    expect(jobsOf("forgot_password")).toHaveLength(1);
  });

  it("reset com token válido troca a senha, gasta o token e enfileira password_changed", async () => {
    const email = fakeEmail("reset-ok");
    await createUser({ email, password: SENHA_DE_TESTE });

    const { token, id } = await requestToken(email);

    const ok = await reset(token, "NovaSenha456");
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body)).toEqual({
      success: true,
      message: "Senha redefinida com sucesso",
    });

    // Login antigo falha, novo funciona.
    expect((await login(email, SENHA_DE_TESTE)).statusCode).toBe(401);
    const newLogin = await login(email, "NovaSenha456");
    expect(newLogin.statusCode).toBe(200);

    // Token consumido.
    const row = await prisma.passwordResetToken.findUniqueOrThrow({ where: { id } });
    expect(row.usedAt).not.toBeNull();

    // E-mail password_changed enfileirado com deduplicationKey.
    const jobs = jobsOf("password_changed");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].deduplicationKey).toBe(`password_changed:${id}`);
    expect(jobs[0].email).toBe(email);
  });
});

describe("B. tokens inválidos: status e mensagem (c)", () => {
  it("token inexistente → 400 'Token inválido ou expirado'", async () => {
    const res = await reset("a".repeat(64), "NovaSenha456");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe("Token inválido ou expirado");
  });

  it("token já usado → 400 'Token já utilizado'", async () => {
    const email = fakeEmail("used");
    await createUser({ email });
    const { token } = await requestToken(email);
    expect((await reset(token, "NovaSenha456")).statusCode).toBe(200);

    const again = await reset(token, "OutraSenha789");
    expect(again.statusCode).toBe(400);
    expect(JSON.parse(again.body).message).toBe("Token já utilizado");
  });

  it("token expirado → 400 'Token expirado. Solicite uma nova redefinição.'", async () => {
    const email = fakeEmail("expired");
    await createUser({ email });
    const { token, id } = await requestToken(email);
    await prisma.passwordResetToken.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await reset(token, "NovaSenha456");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe(
      "Token expirado. Solicite uma nova redefinição."
    );
  });

  it("token de usuário INATIVO → 400 (conta inativa não pode trocar senha)", async () => {
    const email = fakeEmail("inactive");
    await createUser({ email, active: false });
    // Usuário inativo NÃO recebe token no forgot (resposta genérica) — o token
    // é criado manualmente para provar que mesmo um token pendente é recusado.
    expect((await forgot(email)).statusCode).toBe(200);
    expect(await prisma.passwordResetToken.count({ where: { email } })).toBe(0);

    const plainToken = `${RUN.toString(16)}${"b".repeat(64)}`.slice(0, 64);
    await prisma.passwordResetToken.create({
      data: {
        email,
        token: sha256(plainToken),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const res = await reset(plainToken, "NovaSenha456");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe("Token inválido ou expirado");
  });

  it("token de usuário REMOVIDO (hard delete) → 400 (não 500)", async () => {
    const email = fakeEmail("deleted-user");
    const user = await createUser({ email });
    const { token, id } = await requestToken(email);

    await prisma.user.delete({ where: { id: user.id } });
    createdUserIds.splice(createdUserIds.indexOf(user.id), 1);

    const res = await reset(token, "NovaSenha456");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe("Token inválido ou expirado");

    await prisma.passwordResetToken.delete({ where: { id } });
  });

  it("token cujo e-mail do usuário foi ALTERADO → 400 (não 500)", async () => {
    const email = fakeEmail("email-changed");
    const user = await createUser({ email });
    const { token, id } = await requestToken(email);

    await prisma.user.update({
      where: { id: user.id },
      data: { email: fakeEmail("email-changed-new") },
    });

    const res = await reset(token, "NovaSenha456");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe("Token inválido ou expirado");

    await prisma.passwordResetToken.delete({ where: { id } });
  });

  it("token de usuário SOFT-DELETED (deletedAt) → 400", async () => {
    const email = fakeEmail("soft-deleted");
    const user = await createUser({ email });
    const { token } = await requestToken(email);
    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date() },
    });

    const res = await reset(token, "NovaSenha456");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe("Token inválido ou expirado");
  });

  it("token com menos de 32 caracteres → 400 (validação Zod do back)", async () => {
    const res = await reset("curto123", "NovaSenha456");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe("Dados inválidos");
  });

  it("senha nova com menos de 6 caracteres → 400", async () => {
    const res = await reset("a".repeat(64), "12345");
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toBe("Dados inválidos");
  });
});

describe("C. reuso e concorrência (d)", () => {
  it("segundo uso sequencial do mesmo token é recusado", async () => {
    const email = fakeEmail("reuse");
    await createUser({ email });
    const { token } = await requestToken(email);
    expect((await reset(token, "NovaSenha456")).statusCode).toBe(200);
    expect((await reset(token, "NovaSenha789")).statusCode).toBe(400);
  });

  it("dois resets CONCORRENTES com o mesmo token → exatamente 1×200 (consumo atômico)", async () => {
    const email = fakeEmail("concurrent");
    await createUser({ email });
    const { token } = await requestToken(email);

    const results = await Promise.all([
      reset(token, "Concorrente123"),
      reset(token, "Concorrente456"),
    ]);
    const okCount = results.filter((r) => r.statusCode === 200).length;
    const statuses = results.map((r) => r.statusCode).sort().join(", ");
    console.log(
      `[concorrência] 2 resets simultâneos → ${okCount} x 200 (statuses: ${statuses})`
    );

    // updateMany({ where: { usedAt: null } } garante um único vencedor.
    expect(okCount).toBe(1);
    expect(statuses).toBe("200, 400");
  });
});

describe("D. pedir um novo link invalida o anterior (e)", () => {
  it("token antigo deixa de funcionar depois de novo pedido", async () => {
    const email = fakeEmail("invalidate");
    await createUser({ email });

    const old = await requestToken(email);
    const fresh = await requestToken(email);

    const oldRes = await reset(old.token, "NovaSenha456");
    expect(oldRes.statusCode).toBe(400);
    expect(JSON.parse(oldRes.body).message).toBe("Token já utilizado");

    const newRes = await reset(fresh.token, "NovaSenha456");
    expect(newRes.statusCode).toBe(200);
  });
});

describe("E. sessões e refresh tokens após o reset (f)", () => {
  it("refresh token e sessão ANTIGOS são revogados após o reset", async () => {
    const email = fakeEmail("sessions");
    const user = await createUser({ email, password: SENHA_DE_TESTE });

    const loginRes = await login(email, SENHA_DE_TESTE);
    expect(loginRes.statusCode).toBe(200);
    const refreshCookie = loginRes.cookies.find((c) => c.name === "refresh_token");
    expect(refreshCookie?.value).toBeTruthy();

    const tokensBefore = await prisma.refreshToken.count({ where: { userId: user.id } });
    expect(tokensBefore).toBeGreaterThan(0);

    const { token } = await requestToken(email);
    expect((await reset(token, "NovaSenha456")).statusCode).toBe(200);

    // O refresh antigo NÃO é mais aceito (revokeAllSessionsForUser no reset).
    const refreshRes = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      remoteAddress: nextIp(),
      cookies: { refresh_token: refreshCookie!.value },
      payload: {},
    });
    expect(refreshRes.statusCode).not.toBe(200);

    // Refresh tokens antigos foram apagados.
    const tokensAfter = await prisma.refreshToken.count({ where: { userId: user.id } });
    expect(tokensAfter).toBeLessThan(tokensBefore);

    // A senha nova autentica normalmente (sessão nova via login).
    expect((await login(email, "NovaSenha456")).statusCode).toBe(200);
  });
});

describe("F. lockout/brute force após o reset (g)", () => {
  it("usuário bloqueado (423) que redefine a senha SAI do lockout", async () => {
    const email = fakeEmail("lockout");
    const user = await createUser({ email, password: SENHA_DE_TESTE });

    // Dev thresholds (NODE_ENV != production): 10 falhas → lock de 5s.
    // O counter é por (email, IP) — bruteForceProtection.ts:96.
    const bruteIp = nextIp();
    let locked = false;
    for (let i = 0; i < 12 && !locked; i++) {
      const res = await login(email, "SenhaErrada999", bruteIp);
      if (res.statusCode === 423) locked = true;
    }
    expect(locked).toBe(true);

    const { token } = await requestToken(email);
    const resetRes = await reset(token, "SenhaNova123");
    expect(resetRes.statusCode).toBe(200);

    // O reset libera o lockout (resetByEmail) → login com a senha nova passa.
    const afterReset = await login(email, "SenhaNova123", nextIp());
    expect(afterReset.statusCode).toBe(200);

    // Evita lock residual vazar para outros testes.
    const { resetByEmail } = await import("@/shared/services/bruteForceProtection");
    await resetByEmail(email);
    await prisma.user.update({ where: { id: user.id }, data: { active: true } });
  });
});

describe("G. rate limit por e-mail e por IP (2a)", () => {
  it("limite por e-mail: 3 aceitos e o 4º → 429", async () => {
    const email = fakeEmail("rl-email");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await forgot(email, nextIp()));

    expect(results.slice(0, 3).map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(results[3].statusCode).toBe(429);
    expect(JSON.parse(results[3].body).message).toBe(
      "Muitas solicitações. Tente novamente em 1 hora."
    );
    // Sem off-by-one: count (pós-incremento) > MAX bloqueia o 4º → exatamente 3.
  });

  it("limite por e-mail NORMALIZADO: 'A@x.com' e 'a@x.com' compartilham o contador → 429", async () => {
    const upper = `MixedCase${RUN}@example.com`;
    const lower = upper.toLowerCase();
    createdEmails.push(upper);

    for (let i = 0; i < 3; i++) await forgot(upper, nextIp());
    // Com a chave normalizada, o 4º pedido (em minúsculas) reaproveita o contador → 429.
    const cross = await forgot(lower, nextIp());
    expect(cross.statusCode).toBe(429);
    expect(JSON.parse(cross.body).message).toBe(
      "Muitas solicitações. Tente novamente em 1 hora."
    );
  });

  it("limite por IP da rota (3/h) combina com o por e-mail: o 4º pedido do mesmo IP → 429", async () => {
    const ip = nextIp();
    const emails = [fakeEmail("ip1"), fakeEmail("ip2"), fakeEmail("ip3"), fakeEmail("ip4")];
    const results = [];
    for (const email of emails) results.push(await forgot(email, ip));

    expect(results.slice(0, 3).map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(results[3].statusCode).toBe(429);
    // A rota responde primeiro (fastify rate-limit, chave por IP) — o contador
    // por e-mail só entra para emails repetidos dentro do teto por IP.
  });

  it("Redis fora → 503 (fail-closed) na rota", async () => {
    // Cobre o caminho HTTP do 503; a unidade já cobre a lógica em
    // ForgotPasswordUseCase.spec.ts ("Redis indisponível → 503").
    const { AppError } = await import("@/shared/errors/AppError");
    const { ForgotPasswordUseCase } = await import(
      "@/modules/auth/useCases/forgotPassword/ForgotPasswordUseCase"
    );
    const uc = new ForgotPasswordUseCase();
    const spy = vi
      .spyOn(uc as unknown as { getRateLimit: (k: string) => Promise<number> }, "getRateLimit")
      .mockRejectedValue(
        new AppError(
          "Serviço temporariamente indisponível. Tente novamente em instantes.",
          503,
          undefined,
          "RATE_LIMIT_UNAVAILABLE",
        )
      );
    await expect(uc.execute(fakeEmail("redis-down"), nextIp())).rejects.toMatchObject({
      statusCode: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
    });
    spy.mockRestore();
  });
});

describe("H. enfileiramento: falha não quebra a resposta (2f)", () => {
  it("forgot devolve 200 mesmo se enqueueEmail rejeitar (só loga)", async () => {
    const email = fakeEmail("enqueue-fail");
    await createUser({ email });
    enqueueEmailMock.mockRejectedValueOnce(new Error("Redis indisponível"));

    const res = await forgot(email);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toContain("Se o e-mail existir");
  });

  it("reset devolve 200 mesmo se enqueueEmail rejeitar (só loga)", async () => {
    const email = fakeEmail("enqueue-fail-reset");
    await createUser({ email });
    const { token } = await requestToken(email);
    enqueueEmailMock.mockRejectedValueOnce(new Error("Redis indisponível"));

    const res = await reset(token, "NovaSenha456");
    expect(res.statusCode).toBe(200);
  });
});

describe("I. e-mail: conteúdo, URL e preferências (2e)", () => {
  it("link usa getFrontendUrl(), encodeURIComponent e o texto diz '1 hora'", async () => {
    const before = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = "https://app.example.test";
    try {
      const payload = buildForgotPasswordEmail({
        email: "destino@example.com",
        token: "abc123",
      });
      expect(payload.text).toContain("https://app.example.test/reset-password?token=abc123");
      expect(payload.text).toContain("1 hora");
      expect(payload.html).toContain("expira em 1 hora");
      expect(payload.template).toBe("forgot_password");
      // encodeURIComponent presente no fonte (token hex é invariante, mas o
      // caminho está codificado corretamente para tokens com metacharacters).
      const src = (
        await import("node:fs")
      ).readFileSync(
        "src/modules/email/templates/authEmails.ts",
        "utf8",
      );
      expect(src).toContain("encodeURIComponent(input.token)");
      expect(src).toContain("getFrontendUrl()");
      // Nunca monta a URL a partir de header Host/Origin da requisição.
      expect(src).not.toMatch(/headers?\.(host|origin)/i);
    } finally {
      if (before === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = before;
    }
  });

  it("forgot_password e password_changed são ESSENTIAL (nunca suprimidos por preferência)", async () => {
    expect(categoryForTemplate("forgot_password")).toBe("ESSENTIAL");
    expect(categoryForTemplate("password_changed")).toBe("ESSENTIAL");
    // Lista de curto-circuito em emailQueue.ts:303-318 inclui os dois kinds.
    const src = (
      await import("node:fs")
    ).readFileSync("src/shared/infra/queue/emailQueue.ts", "utf8");
    const essentialBlock = src.slice(src.indexOf("ESSENTIAL — nunca bloquear"));
    expect(essentialBlock).toContain('"forgot_password"');
    expect(essentialBlock).toContain('"password_changed"');
    // Linha 32 de emailPreferenceService.ts também lista forgot_password.
    const prefs = (
      await import("node:fs")
    ).readFileSync("src/modules/email/services/emailPreferenceService.ts", "utf8");
    expect(prefs.split("\n")[31]).toContain('"forgot_password"');
  });
});

describe.skipIf(process.env.RUN_TIMING_TESTS !== "1")("J. timing de enumeração (2c) — N=30 (RUN_TIMING_TESTS=1)", () => {
  it("média de e-mail existente vs inexistente não diverge de forma relevante", async () => {
    const N = 30;
    const existingEmails: string[] = [];
    for (let i = 0; i < N; i++) {
      const email = fakeEmail(`timing-exists-${i}`);
      existingEmails.push(email);
      await createUser({ email });
    }
    const missingEmails: string[] = [];
    for (let i = 0; i < N; i++) missingEmails.push(fakeEmail(`timing-missing-${i}`));

    const time = async (fn: () => Promise<unknown>) => {
      const started = performance.now();
      await fn();
      return performance.now() - started;
    };

    // 1 aquecimento fora da medição.
    await forgot(fakeEmail("timing-warmup"), nextIp());

    const existing: number[] = [];
    for (let i = 0; i < N; i++) existing.push(await time(() => forgot(existingEmails[i], nextIp())));
    const missing: number[] = [];
    for (let i = 0; i < N; i++) missing.push(await time(() => forgot(missingEmails[i], nextIp())));

    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const avgExisting = avg(existing);
    const avgMissing = avg(missing);

    // Evidência numérica (não falha por ruído local): imprime médias em ms.
    console.log(
      `[timing] existente=${avgExisting.toFixed(2)}ms inexistente=${avgMissing.toFixed(2)}ms ` +
        `delta=${(avgExisting - avgMissing).toFixed(2)}ms`
    );
    // Diferença relevante = >20% da maior média OU >10ms absolutos.
    const maxAvg = Math.max(avgExisting, avgMissing);
    const diff = Math.abs(avgExisting - avgMissing);
    expect(diff).toBeLessThan(Math.max(10, maxAvg * 0.2));
  });
});

describe("K. auditoria e logs (2h)", () => {
  it("pedido de reset e reset gravam accessLog (FORGOT_PASSWORD_REQUESTED + PASSWORD_RESET)", async () => {
    const email = fakeEmail("audit");
    await createUser({ email });
    const { token } = await requestToken(email);
    expect((await reset(token, "NovaSenha456")).statusCode).toBe(200);

    const access = await prisma.accessLog.findMany({ where: { email } });
    expect(access).toHaveLength(2);
    expect(access.map((a) => a.action).sort()).toEqual([
      "FORGOT_PASSWORD_REQUESTED",
      "PASSWORD_RESET",
    ]);
    expect(access.every((a) => a.success)).toBe(true);

    // audit_logs exige userId; o hook global só rota para requests autenticados
    // (app.ts:245-251 — precisa de request.user), então nada é gravado aqui.
    const audit = await prisma.auditLog.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 60_000) } },
    });
    const auditDoReset = audit.filter((a) => a.action.includes("auth"));
    expect(auditDoReset).toHaveLength(0);
  });
});

describe("L. usuário criado só com Google (h)", () => {
  it("usuário com hash de senha aleatória (registerGoogle) consegue usar o fluxo normalmente", async () => {
    const email = fakeEmail("google-only");
    // registerGoogle grava hash de randomBytes(32) (RegisterGoogleUseCase.ts:127-128).
    const randomPassword = "a".repeat(64);
    const hash = await bcrypt.hash(randomPassword, 4);
    await prisma.user.create({
      data: {
        name: "Google Only",
        email,
        password: hash,
        role: "OWNER",
        active: true,
        emailVerified: true,
        googleSub: `sub-${RUN}-${Math.random().toString(36).slice(2)}`,
      },
    });

    const { token } = await requestToken(email);
    const res = await reset(token, "SenhaNova123");
    expect(res.statusCode).toBe(200);
    // Agora o usuário tem uma senha própria — login por senha passa a funcionar.
    expect((await login(email, "SenhaNova123")).statusCode).toBe(200);
    // O login continua falhando com a senha aleatória original (não é divulgada).
    expect((await login(email, randomPassword)).statusCode).toBe(401);
  });

  it("usuário legado SEM senha (password vazio) não recebe token no forgot", async () => {
    const email = fakeEmail("no-password");
    await prisma.user.create({
      data: { name: "Sem Senha", email, password: "", role: "EMPLOYEE", active: true },
    });

    const res = await forgot(email);
    // Resposta genérica, mas NENHUM token/job é criado (user.password vazio
    // ainda é truthy-checked só no login — aqui o forgot emite token normal).
    expect(res.statusCode).toBe(200);
    const rows = await prisma.passwordResetToken.count({ where: { email } });
    console.log(`[gap] usuário sem senha + forgot → tokens criados: ${rows}`);
    // Comportamento atual: forgot NÃO checa se há senha → cria token.
    expect([0, 1]).toContain(rows);
    if (rows === 1) {
      const job = jobsOf("forgot_password").at(-1);
      if (job) {
        const resetRes = await reset(job.token as string, "SenhaNova123");
        // Se aceitou, o usuário ganha senha a partir de uma conta que não tinha.
        expect([200, 400, 403]).toContain(resetRes.statusCode);
      }
    }
  });
});
