/// <reference types="vitest/globals" />
/**
 * Atomicidade de `QueueRepository.completeWithCommissions` (caminho REAL, Postgres).
 *
 * Motivo: a extensão RLS (`prismaExtensions.ts`) reroteia cada operação de model
 * para o SEU `prisma.$transaction` quando `insideRlsTx` não está setado. Como
 * `completeWithCommissions` usava `prisma.$transaction` direto (não `rlsTransaction`),
 * cada escrita cometia em conexões separadas — uma falha no caixa deixava a fila
 * COMPLETED + comissão gravadas sem cash_movement (gravação parcial).
 *
 * O teste força a falha no caixa com `finalPrice = 1e15` (estoura o `Decimal(12,2)`
 * de `cash_movements`, limite 10^10) e asserta o comportamento correto: rollback
 * total. Antes do fix isto falha; depois, passa.
 *
 * Requer Postgres local (docker-compose, porta 5442) via `.env`.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { QueueRepository } from "@/modules/queue/infra/repositories/QueueRepository";

const HUGE = 1e15; // > 10^10 → numeric field overflow em cash_movements.Decimal(12,2)

describe("atomicidade de completeWithCommissions (Postgres real)", () => {
  const repo = new QueueRepository();
  const shopId = randomUUID();
  const serviceId = randomUUID();
  const clientId = randomUUID();
  const professionalId = randomUUID();

  async function seedShop() {
    const plan = await prisma.plan.findFirst({ where: { active: true } });
    if (!plan) throw new Error("sem plano ativo no banco de teste");
    await prisma.barbershop.create({
      data: {
        id: shopId,
        name: `[QA-ATOMIC] ${shopId.slice(0, 8)}`,
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
        name: "[QA-ATOMIC] Corte",
        price: 50,
        avgTimeMinutes: 30,
        icon: "scissors",
        active: true,
        commissionPercent: 40,
      },
    });
    await prisma.salonClient.create({
      data: { id: clientId, barbershopId: shopId, name: "[QA-ATOMIC] Cliente", whatsapp: "11999990098" },
    });
    await prisma.user.create({
      data: {
        id: professionalId,
        name: "[QA-ATOMIC] Barbeiro",
        email: `qa.atomic.${shopId.slice(0, 8)}@agendai.local`,
        password: "x",
        role: "EMPLOYEE",
        barbershopId: shopId,
        emailVerified: true,
        active: true,
      },
    });
  }

  /** Cria um item de fila já em IN_CHAIR (pronto para conclusão). */
  async function seedInChair(name: string) {
    const id = randomUUID();
    await prisma.queueItem.create({
      data: {
        id,
        barbershopId: shopId,
        serviceId,
        customerId: clientId,
        customerName: name,
        whatsapp: "11999990097",
        status: "IN_CHAIR",
        joinedAt: new Date(),
        clientId,
        addedByStaff: true,
      },
    });
    return id;
  }

  async function estado(id: string) {
    const item = await prisma.queueItem.findUnique({ where: { id }, select: { status: true, finalPrice: true } });
    const ce = await prisma.commissionEntry.count({ where: { queueItemId: id } });
    const cm = await prisma.cashMovement.count({ where: { sourceId: id, sourceType: "QUEUE_ITEM" } });
    return { status: item?.status ?? null, finalPrice: item?.finalPrice, ce, cm };
  }

  beforeAll(async () => {
    await seedShop();
  });

  afterAll(async () => {
    // Limpeza da fixture [QA-ATOMIC] (cascata cobre filhos com FK).
    await prisma.cashMovement.deleteMany({ where: { barbershopId: shopId } });
    await prisma.commissionEntry.deleteMany({ where: { barbershopId: shopId } });
    await prisma.queueItem.deleteMany({ where: { barbershopId: shopId } });
    await prisma.salonClient.deleteMany({ where: { barbershopId: shopId } });
    await prisma.service.deleteMany({ where: { barbershopId: shopId } });
    await prisma.user.deleteMany({ where: { barbershopId: shopId } });
    await prisma.barbershop.delete({ where: { id: shopId } }).catch(() => undefined);
  });

  it("falha no caixa faz rollback TOTAL (fila segue IN_CHAIR, 0 comissão, 0 caixa)", async () => {
    const id = await seedInChair("[QA-ATOMIC] overflow");

    // 1e15 estoura o Decimal(12,2) de cash_movements → o create do ledger falha.
    await expect(
      repo.completeWithCommissions(id, {
        completedBy: professionalId,
        finalPrice: HUGE,
        paymentMethod: "pix",
        splits: [{ professionalId, percentage: 40 }],
      }),
    ).rejects.toThrow();

    // 2) Comportamento correto: rollback total — nada pode ter persistido.
    const after = await estado(id);
    expect(after.status).toBe("IN_CHAIR"); // não pode virar COMPLETED
    expect(after.ce).toBe(0); // nenhuma comissão órfã
    expect(after.cm).toBe(0); // nenhum caixa órfão
  }, 60_000);

  it("após a falha, o mesmo item ainda pode ser concluído com preço válido", async () => {
    const id = await seedInChair("[QA-ATOMIC] retry");

    await expect(
      repo.completeWithCommissions(id, {
        completedBy: professionalId,
        finalPrice: HUGE,
        paymentMethod: "pix",
        splits: [{ professionalId, percentage: 40 }],
      }),
    ).rejects.toThrow();

    // Retry com preço válido no MESMO item (só possível se o anterior reverteu).
    const ok = await repo.completeWithCommissions(id, {
      completedBy: professionalId,
      finalPrice: 50,
      paymentMethod: "pix",
      splits: [{ professionalId, percentage: 40 }],
    });

    expect(ok.item.status).toBe("completed");
    const after = await estado(id);
    expect(after.status).toBe("COMPLETED");
    expect(after.ce).toBe(1);
    expect(after.cm).toBe(1);
  }, 60_000);

  it("conclusão válida grava comissão e caixa coerentes (não regredir)", async () => {
    const id = await seedInChair("[QA-ATOMIC] valido");

    await repo.completeWithCommissions(id, {
      completedBy: professionalId,
      finalPrice: 50,
      paymentMethod: "pix",
      splits: [{ professionalId, percentage: 40 }],
    });

    const after = await estado(id);
    expect(after.status).toBe("COMPLETED");
    expect(after.ce).toBe(1);
    expect(after.cm).toBe(1);

    const cm = await prisma.cashMovement.findFirst({
      where: { sourceId: id, sourceType: "QUEUE_ITEM" },
      select: { amount: true, type: true },
    });
    expect(cm?.type).toBe("SERVICE_SALE");
    expect(Number(cm?.amount)).toBe(50);

    const ce = await prisma.commissionEntry.findFirst({
      where: { queueItemId: id },
      select: { amount: true, percentage: true },
    });
    expect(ce?.percentage).toBe(40);
    expect(Number(ce?.amount)).toBe(20); // 50 * 40% = 20
  }, 60_000);
});
