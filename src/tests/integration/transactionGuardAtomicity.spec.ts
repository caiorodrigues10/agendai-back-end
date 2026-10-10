/// <reference types="vitest/globals" />
/**
 * Guard atômico de `prisma.$transaction` (caminho REAL, Postgres).
 *
 * Motivo: a extensão RLS (`prismaExtensions.ts`) reroteia cada operação de model
 * para o SEU `prisma.$transaction` quando `insideRlsTx` não está setado. Por isso
 * `prisma.$transaction(async tx => …)` NÃO era atômico: cada escrita commitava
 * sozinha em outra conexão. Medido em 2026-10-10: 1 escrita sobrevivia à falha
 * do corpo; só `rlsTransaction` dava rollback (0 sobreviventes).
 *
 * O fix embrulha `$transaction` (`aplicarGuardAtomico`) delegando o callback-form
 * a `rlsTransaction`. Antes do fix os testes 1 e 3 falham; depois, passam.
 *
 * Requer Postgres local (docker-compose) via `.env`.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { rlsTransaction } from "@/libs/prismaExtensions";
import { requestContext } from "@/shared/infra/http/requestContext";

describe("guard atômico de $transaction (Postgres real)", () => {
  const shopId = randomUUID();
  const serviceId = randomUUID();
  const professionalId = randomUUID();

  async function seedShop() {
    await prisma.barbershop.create({
      data: {
        id: shopId,
        name: `[QA-GUARD-TX] ${shopId.slice(0, 8)}`,
        whatsapp: "11999990099",
        operationMode: "HYBRID",
        approvalStatus: "APPROVED",
        active: true,
      },
    });
    await prisma.service.create({
      data: {
        id: serviceId,
        barbershopId: shopId,
        name: "[QA-GUARD-TX] Corte",
        price: 50,
        avgTimeMinutes: 30,
        icon: "scissors",
        active: true,
        commissionPercent: 40,
      },
    });
    await prisma.user.create({
      data: {
        id: professionalId,
        name: "[QA-GUARD-TX] Barbeiro",
        email: `qa.guardtx.${shopId.slice(0, 8)}@agendai.local`,
        password: "x",
        role: "EMPLOYEE",
        barbershopId: shopId,
        emailVerified: true,
        active: true,
      },
    });
  }

  function dados(amount: number) {
    return { barbershopId: shopId, serviceId, professionalId, percentage: 10, amount };
  }

  const conta = (amount: number) =>
    prisma.commissionEntry.count({ where: { amount, barbershopId: shopId } });

  beforeAll(seedShop);

  afterAll(async () => {
    await prisma.commissionEntry.deleteMany({ where: { barbershopId: shopId } });
    await prisma.user.deleteMany({ where: { barbershopId: shopId } });
    await prisma.service.deleteMany({ where: { barbershopId: shopId } });
    await prisma.barbershop.delete({ where: { id: shopId } }).catch(() => undefined);
  });

  it("callback-form dá rollback quando o corpo lança (antes: a escrita sobrevivia)", async () => {
    await expect(
      prisma.$transaction(async (tx: any) => {
        await tx.commissionEntry.create({ data: dados(0.11111) });
        throw new Error("boom-guard-tx");
      }),
    ).rejects.toThrow("boom-guard-tx");

    expect(await conta(0.11111)).toBe(0);
  }, 60_000);

  it("rlsTransaction continua dando rollback (controle)", async () => {
    await expect(
      rlsTransaction(async (tx: any) => {
        await tx.commissionEntry.create({ data: dados(0.22222) });
        throw new Error("boom-rls");
      }),
    ).rejects.toThrow("boom-rls");

    expect(await conta(0.22222)).toBe(0);
  }, 60_000);

  it("o GUC de RLS está armado na MESMA conexão do callback (antes: ficava vazio)", async () => {
    await requestContext.run({ barbershopId: shopId }, async () => {
      await prisma.$transaction(async (tx: any) => {
        const rows = await tx.$queryRaw<
          { v: string | null }[]
        >`SELECT current_setting('app.current_barbershop_id', TRUE) AS v`;
        expect(rows[0]?.v).toBe(shopId);
      });
    });
  }, 60_000);

  it("escrita válida no callback persiste (não regredir)", async () => {
    await prisma.$transaction(async (tx: any) => {
      await tx.commissionEntry.create({ data: dados(0.33333) });
      await tx.commissionEntry.create({ data: dados(0.33334) });
    });

    expect(await conta(0.33333)).toBe(1);
    expect(await conta(0.33334)).toBe(1);
  }, 60_000);
});
