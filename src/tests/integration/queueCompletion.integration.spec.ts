/// <reference types="vitest/globals" />
/**
 * Integração (Postgres real no :5442): conclusão da fila atômica e
 * idempotente + arquivamento lógico + autorização por permissão nas rotas.
 * Cobre os aceites dos Lotes A/B contra o banco de verdade.
 */
import { randomUUID } from "node:crypto";
import { sign, type Secret } from "jsonwebtoken";
import auth from "@/config/auth";
import type { FastifyInstance } from "fastify";
import {
  startPostgresHarness,
  createProbePrisma,
  type PostgresHarness,
} from "../helpers/postgres";

type Probe = ReturnType<typeof createProbePrisma>;

describe("queue completion — atomicidade, idempotência e arquivamento (DB real)", () => {
  let harness: PostgresHarness | undefined;
  let app: FastifyInstance;
  let prisma: Probe;
  let closeTestApp: (a: FastifyInstance) => Promise<void>;

  let shopId: string;
  let serviceId: string;
  let owner: { id: string; role: string };
  let staffWithPerm: { id: string; role: string };
  let staffNoPerm: { id: string; role: string };

  function tokenFor(user: { id: string; role: string }): string {
    return sign(
      { role: user.role, barbershopId: shopId },
      auth.secret as Secret,
      { subject: user.id, expiresIn: "1h" },
    );
  }

  async function seedQueueItem(status: "WAITING" | "IN_CHAIR"): Promise<string> {
    const row = await prisma.queueItem.create({
      data: {
        barbershopId: shopId,
        serviceId,
        customerId: randomUUID(),
        customerName: "Cliente QA",
        whatsapp: "11999990000",
        status,
      },
    });
    return row.id;
  }

  beforeAll(async () => {
    harness = await startPostgresHarness();
    const helpers = await import("../helpers/createTestApp");
    closeTestApp = helpers.closeTestApp;
    app = await helpers.createTestApp();
    prisma = createProbePrisma();

    const shop = await prisma.barbershop.create({
      data: { name: "QA Queue B", whatsapp: "11900000001" },
    });
    shopId = shop.id;
    const service = await prisma.service.create({
      data: {
        barbershopId: shopId,
        name: "Corte QA",
        price: 50,
        avgTimeMinutes: 30,
        icon: "scissors",
      },
    });
    serviceId = service.id;
    owner = await prisma.user.create({
      data: {
        name: "Owner QA",
        email: `owner-${randomUUID()}@qa.local`,
        password: "x",
        role: "OWNER",
        barbershopId: shopId,
      },
      select: { id: true, role: true },
    });
    staffWithPerm = await prisma.user.create({
      data: {
        name: "Staff Perm QA",
        email: `staffp-${randomUUID()}@qa.local`,
        password: "x",
        role: "EMPLOYEE",
        barbershopId: shopId,
        permissions: ["QUEUE_MANAGE"],
      },
      select: { id: true, role: true },
    });
    staffNoPerm = await prisma.user.create({
      data: {
        name: "Staff SemPerm QA",
        email: `staffn-${randomUUID()}@qa.local`,
        password: "x",
        role: "EMPLOYEE",
        barbershopId: shopId,
        permissions: [],
      },
      select: { id: true, role: true },
    });
  }, 180_000);

  afterAll(async () => {
    try {
      // Cascade do estabelecimento limpa queue/serviços/users/fiados/ledger.
      if (prisma && shopId) {
        await prisma.barbershop.deleteMany({ where: { id: shopId } });
      }
    } catch { /* limpeza best-effort */ }
    if (app && closeTestApp) await closeTestApp(app);
    if (prisma) await prisma.$disconnect();
    if (harness) await harness.stop();
  });

  it("EMPLOYEE sem QUEUE_MANAGE não altera a fila (403); com a permissão altera", async () => {
    const id = await seedQueueItem("WAITING");

    const denied = await app.inject({
      method: "PATCH",
      url: `/api/queue/${id}`,
      headers: { authorization: `Bearer ${tokenFor(staffNoPerm)}` },
      payload: { status: "in_chair" },
    });
    expect(denied.statusCode).toBe(403);

    const ok = await app.inject({
      method: "PATCH",
      url: `/api/queue/${id}`,
      headers: { authorization: `Bearer ${tokenFor(staffWithPerm)}` },
      payload: { status: "in_chair" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: "in_chair" });
  });

  it("conclusão com fiado é atômica: status + ledger + título nascem juntos", async () => {
    const id = await seedQueueItem("IN_CHAIR");

    const res = await app.inject({
      method: "PATCH",
      url: `/api/queue/${id}`,
      headers: { authorization: `Bearer ${tokenFor(owner)}` },
      payload: { status: "completed", finalPrice: 50, paymentMethod: "fiado" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "completed" });

    const fiados = await prisma.fiado.count({ where: { barbershopId: shopId, notes: { contains: `(${id})` } } });
    expect(fiados).toBe(1);

    const ledger = await prisma.cashMovement.count({
      where: { barbershopId: shopId, sourceType: "QUEUE_ITEM", sourceId: id, type: "SERVICE_SALE" },
    });
    expect(ledger).toBe(1);
  });

  it("repetir a conclusão responde alreadyCompleted sem duplicar fiado nem ledger", async () => {
    const id = await seedQueueItem("IN_CHAIR");
    const headers = { authorization: `Bearer ${tokenFor(owner)}` };

    const first = await app.inject({
      method: "PATCH",
      url: `/api/queue/${id}`,
      headers,
      payload: { status: "completed", finalPrice: 50, paymentMethod: "fiado" },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().alreadyCompleted ?? false).toBe(false);

    const second = await app.inject({
      method: "PATCH",
      url: `/api/queue/${id}`,
      headers,
      payload: { status: "completed", finalPrice: 50, paymentMethod: "fiado" },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ status: "completed", alreadyCompleted: true });

    const fiados = await prisma.fiado.count({ where: { barbershopId: shopId, notes: { contains: `(${id})` } } });
    expect(fiados).toBe(1);
    const ledger = await prisma.cashMovement.count({
      where: { barbershopId: shopId, sourceType: "QUEUE_ITEM", sourceId: id, type: "SERVICE_SALE" },
    });
    expect(ledger).toBe(1);
  });

  it("arquivar esconde das vistas da fila sem mudar o contador histórico", async () => {
    const id = await seedQueueItem("IN_CHAIR");
    const headers = { authorization: `Bearer ${tokenFor(owner)}` };

    await app.inject({
      method: "PATCH",
      url: `/api/queue/${id}`,
      headers,
      payload: { status: "completed", finalPrice: 40, paymentMethod: "pix" },
    });

    const metricsBefore = await app.inject({
      method: "GET",
      url: "/api/queue/metrics",
      headers,
    });
    expect(metricsBefore.statusCode).toBe(200);
    const before = metricsBefore.json().completedCount as number;

    const del = await app.inject({
      method: "DELETE",
      url: `/api/queue/${id}`,
      headers,
      payload: { reason: "teste de arquivamento" },
    });
    expect(del.statusCode).toBe(204);

    const row = await prisma.queueItem.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row!.archivedAt).not.toBeNull();
    expect(row!.archivedBy).toBe(owner.id);

    const history = await app.inject({
      method: "GET",
      url: `/api/queue?barbershopId=${shopId}&status=all`,
      headers,
    });
    expect(history.statusCode).toBe(200);
    const items = history.json() as Array<{ id: string }>;
    expect(items.find((i) => i.id === id)).toBeUndefined();

    const metricsAfter = await app.inject({
      method: "GET",
      url: "/api/queue/metrics",
      headers,
    });
    expect(metricsAfter.json().completedCount).toBe(before);
  });

  it("GET /queue/metrics exige QUEUE_MANAGE para EMPLOYEE", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/queue/metrics",
      headers: { authorization: `Bearer ${tokenFor(staffNoPerm)}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
