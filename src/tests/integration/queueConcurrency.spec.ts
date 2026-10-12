/// <reference types="vitest/globals" />
/**
 * Concorrência em `QueueRepository.completeWithCommissions` (Postgres real).
 *
 * A atomicidade de ROLLBACK já é coberta por queueAtomicity.spec.ts; falta
 * prova do outro lado: duas conclusões DISPUTANDO o mesmo item. O guard é
 * otimista — `updateMany({ where: { id, status: "IN_CHAIR" } })` e
 * `if (updated.count !== 1) throw QUEUE_ITEM_ALREADY_COMPLETED`. Sob READ
 * COMMITTED a segunda transação bloqueia na linha e, quando a primeira
 * confirma, encontra status != IN_CHAIR: 0 linhas afetadas → erro.
 *
 * O que este teste garante: só UMA conclusão vence e o ledger fica com exatamente
 * UMA comissão e UM caixa — nada de entrada dupla (pay Twice) nem gravação órfã.
 *
 * Requer Postgres local (docker-compose, porta 5442) via `.env`.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { QueueRepository } from "@/modules/queue/infra/repositories/QueueRepository";

describe("concorrência de completeWithCommissions (Postgres real)", () => {
  const repo = new QueueRepository();
  const shopId = randomUUID();
  const serviceId = randomUUID();
  const clientId = randomUUID();
  const professionalId = randomUUID();

  async function seedShop() {
    await prisma.barbershop.create({
      data: {
        id: shopId,
        name: `[QA-CONC] ${shopId.slice(0, 8)}`,
        whatsapp: "11999990096",
        operationMode: "HYBRID",
        approvalStatus: "APPROVED",
        active: true,
      },
    });
    await prisma.service.create({
      data: {
        id: serviceId,
        barbershopId: shopId,
        name: "[QA-CONC] Corte",
        price: 50,
        avgTimeMinutes: 30,
        icon: "scissors",
        active: true,
        commissionPercent: 40,
      },
    });
    await prisma.salonClient.create({
      data: { id: clientId, barbershopId: shopId, name: "[QA-CONC] Cliente", whatsapp: "11999990095" },
    });
    await prisma.user.create({
      data: {
        id: professionalId,
        name: "[QA-CONC] Barbeiro",
        email: `qa.conc.${shopId.slice(0, 8)}@agendai.local`,
        password: "x",
        role: "EMPLOYEE",
        barbershopId: shopId,
        emailVerified: true,
        active: true,
      },
    });
  }

  async function seedInChair() {
    const id = randomUUID();
    await prisma.queueItem.create({
      data: {
        id,
        barbershopId: shopId,
        serviceId,
        customerId: clientId,
        customerName: "[QA-CONC] Corrida",
        whatsapp: "11999990094",
        status: "IN_CHAIR",
        joinedAt: new Date(),
        clientId,
        addedByStaff: true,
      },
    });
    return id;
  }

  async function ledger(queueItemId: string) {
    const item = await prisma.queueItem.findUnique({
      where: { id: queueItemId },
      select: { status: true, finalPrice: true },
    });
    const commissions = await prisma.commissionEntry.count({ where: { queueItemId } });
    const cash = await prisma.cashMovement.count({
      where: { sourceId: queueItemId, sourceType: "QUEUE_ITEM" },
    });
    const cashSum = await prisma.cashMovement.aggregate({
      where: { sourceId: queueItemId, sourceType: "QUEUE_ITEM" },
      _sum: { amount: true },
    });
    return {
      status: item?.status ?? null,
      finalPrice: item?.finalPrice ?? null,
      commissions,
      cash,
      cashSum: cashSum._sum.amount ?? 0,
    };
  }

  beforeAll(async () => {
    await seedShop();
  });

  afterAll(async () => {
    await prisma.cashMovement.deleteMany({ where: { barbershopId: shopId } });
    await prisma.commissionEntry.deleteMany({ where: { barbershopId: shopId } });
    await prisma.queueItem.deleteMany({ where: { barbershopId: shopId } });
    await prisma.salonClient.deleteMany({ where: { barbershopId: shopId } });
    await prisma.service.deleteMany({ where: { barbershopId: shopId } });
    await prisma.user.deleteMany({ where: { barbershopId: shopId } });
    await prisma.barbershop.delete({ where: { id: shopId } }).catch(() => undefined);
  });

  it("duas conclusões simultâneas: só uma vence e o ledger não duplica", async () => {
    const id = await seedInChair();

    const tentativa = (finalPrice: number) =>
      repo.completeWithCommissions(id, {
        completedBy: professionalId,
        finalPrice,
        paymentMethod: "pix",
        splits: [{ professionalId, percentage: 40 }],
      });

    // Preços diferentes para provar que não é "as duas deram o mesmo resultado".
    const results = await Promise.allSettled([tentativa(50), tentativa(70)]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    // 1) Exatamente uma conclusão vence.
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(String(failed[0].reason)).toContain("QUEUE_ITEM_ALREADY_COMPLETED");

    // 2) Ledger com exatamente UMA comissão e UM caixa — sem entrada dupla.
    const after = await ledger(id);
    expect(after.status).toBe("COMPLETED");
    expect(after.commissions).toBe(1);
    expect(after.cash).toBe(1);

    // 3) O caixa registra o valor do VENCEDOR, não a soma das duas tentativas.
    const winnerPrice = ok[0].status === "fulfilled" ? ok[0].value.item.finalPrice : null;
    expect([50, 70]).toContain(Number(winnerPrice));
    expect(Number(after.cashSum)).toBe(Number(winnerPrice));
    expect(Number(after.cashSum)).not.toBe(120);
  }, 60_000);

  it("a partir de COMPLETED, uma nova conclusão é recusada (não há estado intermediário)", async () => {
    const id = await seedInChair();

    await repo.completeWithCommissions(id, {
      completedBy: professionalId,
      finalPrice: 50,
      paymentMethod: "pix",
      splits: [{ professionalId, percentage: 40 }],
    });

    await expect(
      repo.completeWithCommissions(id, {
        completedBy: professionalId,
        finalPrice: 50,
        paymentMethod: "pix",
        splits: [{ professionalId, percentage: 40 }],
      }),
    ).rejects.toThrow("QUEUE_ITEM_ALREADY_COMPLETED");

    const after = await ledger(id);
    expect(after.commissions).toBe(1);
    expect(after.cash).toBe(1);
  }, 60_000);
});
