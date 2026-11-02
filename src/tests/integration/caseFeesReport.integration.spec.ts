/// <reference types="vitest/globals" />
import { randomUUID } from "node:crypto";
import { sign, type Secret } from "jsonwebtoken";
import auth from "@/config/auth";
import type { FastifyInstance } from "fastify";
import { prisma } from "@/libs/prismaClient";
import { startPostgresHarness, type PostgresHarness } from "../helpers/postgres";

describe("GET /cases/reports/fees — isolamento entre salões", () => {
  let harness: PostgresHarness | undefined;
  let app: FastifyInstance;
  let closeTestApp: (a: FastifyInstance) => Promise<void>;
  let shopAId: string;
  let shopBId: string;
  let ownerAId: string;
  let ownerBId: string;

  function tokenFor(userId: string, tenant: string): string {
    return sign(
      { role: "OWNER", barbershopId: tenant },
      auth.secret as Secret,
      { subject: userId, expiresIn: "1h" },
    );
  }

  beforeAll(async () => {
    harness = await startPostgresHarness();
    const helpers = await import("../helpers/createTestApp");
    closeTestApp = helpers.closeTestApp;
    app = await helpers.createTestApp();

    const shopA = await prisma.barbershop.create({
      data: {
        name: "QA Honorários A",
        whatsapp: "11900000701",
        businessSegment: "LAW_FIRM",
      },
    });
    shopAId = shopA.id;

    const shopB = await prisma.barbershop.create({
      data: {
        name: "QA Honorários B",
        whatsapp: "11900000702",
        businessSegment: "LAW_FIRM",
      },
    });
    shopBId = shopB.id;

    const ownerA = await prisma.user.create({
      data: {
        name: "Owner Honorários A",
        email: `owner-fees-a-${randomUUID()}@qa.local`,
        password: "x",
        role: "OWNER",
        barbershopId: shopAId,
      },
      select: { id: true },
    });
    ownerAId = ownerA.id;

    const ownerB = await prisma.user.create({
      data: {
        name: "Owner Honorários B",
        email: `owner-fees-b-${randomUUID()}@qa.local`,
        password: "x",
        role: "OWNER",
        barbershopId: shopBId,
      },
      select: { id: true },
    });
    ownerBId = ownerB.id;

    for (const [shopId, name, amount, nickname] of [
      [shopAId, "Cliente Honorários A", 2000, "Caso sigiloso A"],
      [shopBId, "Cliente Honorários B", 9999, "Caso sigiloso B"],
    ] as const) {
      const client = await prisma.salonClient.create({
        data: { barbershopId: shopId, name, whatsapp: randomUUID().slice(0, 11) },
        select: { id: true },
      });
      const lawsuit = await prisma.clientCase.create({
        data: {
          barbershopId: shopId,
          clientId: client.id,
          nickname,
          caseNumber: null,
        },
        select: { id: true },
      });
      await prisma.caseSuccessFee.create({
        data: {
          barbershopId: shopId,
          caseId: lawsuit.id,
          percent: 20,
          baseAmount: amount * 5,
          amount,
          installments: 1,
          status: "PENDING",
        },
      });
    }
  }, 180_000);

  afterAll(async () => {
    await prisma.barbershop.deleteMany({ where: { id: { in: [shopAId, shopBId] } } });
    if (app) await closeTestApp(app);
    if (harness) await harness.stop();
  });

  it("cada dono vê apenas os honorários do próprio salão", async () => {
    const responseA = await app.inject({
      method: "GET",
      url: "/api/cases/reports/fees",
      headers: { authorization: `Bearer ${tokenFor(ownerAId, shopAId)}` },
    });
    expect(responseA.statusCode).toBe(200);

    const bodyA = responseA.json() as {
      data: {
        summary: { totalAmount: number; totalCount: number };
        rows: Array<{ clientName: string | null; caseName: string | null; amount: number | null }>;
      };
    };
    expect(bodyA.data.summary.totalCount).toBe(1);
    expect(bodyA.data.summary.totalAmount).toBe(2000);
    expect(bodyA.data.rows).toHaveLength(1);
    expect(bodyA.data.rows[0]).toMatchObject({
      clientName: "Cliente Honorários A",
      caseName: "Caso sigiloso A",
      amount: 2000,
    });
    expect(JSON.stringify(bodyA)).not.toContain("Cliente Honorários B");
    expect(JSON.stringify(bodyA)).not.toContain("Caso sigiloso B");

    const responseB = await app.inject({
      method: "GET",
      url: "/api/cases/reports/fees",
      headers: { authorization: `Bearer ${tokenFor(ownerBId, shopBId)}` },
    });
    expect(responseB.statusCode).toBe(200);

    const bodyB = responseB.json() as {
      data: {
        summary: { totalAmount: number; totalCount: number };
        rows: Array<{ clientName: string | null; caseName: string | null; amount: number | null }>;
      };
    };
    expect(bodyB.data.summary.totalCount).toBe(1);
    expect(bodyB.data.summary.totalAmount).toBe(9999);
    expect(bodyB.data.rows).toHaveLength(1);
    expect(bodyB.data.rows[0]).toMatchObject({
      clientName: "Cliente Honorários B",
      caseName: "Caso sigiloso B",
      amount: 9999,
    });
    expect(JSON.stringify(bodyB)).not.toContain("Cliente Honorários A");
    expect(JSON.stringify(bodyB)).not.toContain("Caso sigiloso A");
  });
});
