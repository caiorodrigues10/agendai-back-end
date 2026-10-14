/// <reference types="vitest/globals" />
/**
 * Unicidade de CPF (1 CPF = 1 conta) contra Postgres real.
 *
 * O que só um teste real pega: o índice único `users_cpf_key` barra a segunda
 * escrita mesmo quando o `findFirst` de pré-checagem perde uma corrida, e a
 * transação do RegisterUseCase inteira cai (nenhum barbershop órfão).
 *
 * Só o validador de e-mail é mockado (lookup MX real). Prisma, hash e sessão
 * rodam de verdade.
 *
 * Requer Postgres local (docker-compose, porta 5442) via `.env`.
 */
import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { prisma } from "@/libs/prismaClient";
import { RegisterUseCase } from "@/modules/auth/useCases/register/RegisterUseCase";

vi.mock("@/shared/services/emailValidationService", () => ({
  validateEmail: vi.fn(async () => ({ valid: true })),
}));

const SUFFIX = randomUUID().slice(0, 8);

/** CPF válido e distinto por execução (algoritmo da Receita). */
function validCpf(seed: number): string {
  const base = String(100000000 + (seed % 899999999)).padStart(9, "0");
  const digit = (slice: string, factor: number) => {
    const sum = [...slice].reduce((acc, d, i) => acc + Number(d) * (factor - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = digit(base, 10);
  const d2 = digit(base + d1, 11);
  return base + d1 + d2;
}

const useCase = new RegisterUseCase({
  hash: async (v: string) => `hashed:${v}`,
  compare: async () => true,
} as never);

function registerInput(cpf: string, tag: string) {
  return {
    ownerName: `Dono CPF ${tag}`,
    email: `cpf-unique-${tag}-${SUFFIX}@gmail.com`,
    password: "segredo123",
    cpf,
    barbershopName: `Salao CPF ${tag} ${SUFFIX}`,
    whatsapp: "11999998888",
    termsVersion: "1.0",
    termsAccepted: true,
    marketingOptIn: false,
    lgpdConsent: true,
  };
}

describe("unicidade de CPF (Postgres real)", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    const users = { id: { in: createdUserIds.filter(Boolean) } };
    const shops = await prisma.user.findMany({ where: users, select: { barbershopId: true } });
    const shopIds = shops.map((u) => u.barbershopId).filter(Boolean) as string[];
    await prisma.user.deleteMany({ where: users });
    if (shopIds.length) {
      await prisma.barbershop.deleteMany({ where: { id: { in: shopIds } } });
    }
  });

  it("o índice único barra INSERT direto com mesmo cpf", async () => {
    const cpf = validCpf(Date.now() % 100000);
    const first = await prisma.user.create({
      data: {
        name: "QA CPF Unico A",
        email: `cpf-direct-a-${SUFFIX}@gmail.com`,
        password: "hashed:x",
        role: "OWNER",
        cpf,
      },
      select: { id: true },
    });
    createdUserIds.push(first.id);

    let caught: unknown;
    try {
      await prisma.user.create({
        data: {
          name: "QA CPF Unico B",
          email: `cpf-direct-b-${SUFFIX}@gmail.com`,
          password: "hashed:x",
          role: "OWNER",
          cpf,
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeTruthy();
    expect((caught as { code?: string }).code).toBe("P2002");
  });

  it("corrida: duas contas simultâneas com o mesmo cpf → exatamente uma cria, a outra recebe 409", async () => {
    const cpf = validCpf((Date.now() % 100000) + 7);

    const results = await Promise.allSettled([
      useCase.execute(registerInput(cpf, "race-a") as never),
      useCase.execute(registerInput(cpf, "race-b") as never),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const err = rejected[0].reason as { message?: string; statusCode?: number };
    expect(err.message).toBe("CPF já cadastrado");
    expect(err.statusCode).toBe(409);

    const rows = await prisma.user.count({ where: { cpf } });
    expect(rows).toBe(1);

    const fulfilledUser = (fulfilled[0] as PromiseFulfilledResult<{ user: { id: string } }>).value;
    createdUserIds.push(fulfilledUser.user.id);
  });

  it("mesmo cpf com máscara é o mesmo CPF: segunda tentativa falha com 409", async () => {
    const cpf = validCpf((Date.now() % 100000) + 13);
    const masked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

    const first = await useCase.execute(registerInput(cpf, "mask-a") as never);
    createdUserIds.push(first.user.id);

    await expect(useCase.execute(registerInput(masked, "mask-b") as never)).rejects.toMatchObject({
      message: "CPF já cadastrado",
      statusCode: 409,
    });

    const rows = await prisma.user.count({ where: { cpf } });
    expect(rows).toBe(1);
  });
});
