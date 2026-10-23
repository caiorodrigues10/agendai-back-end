/// <reference types="vitest/globals" />
/**
 * Integração (Postgres real no :5442): acesso à seção products/estoque.
 * OWNER tem acesso total ao próprio salão (sem depender de `user.permissions`),
 * EMPLOYEE depende de permissão explícita e a barbershopId do token isola
 * os dados entre salões.
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

describe("products access — OWNER total, EMPLOYEE por permissão (DB real)", () => {
  let harness: PostgresHarness | undefined;
  let app: FastifyInstance;
  let prisma: Probe;
  let closeTestApp: (a: FastifyInstance) => Promise<void>;

  let shopId: string;
  let otherShopId: string;
  let productId: string;
  let owner: { id: string; role: string };
  let otherOwner: { id: string; role: string };
  let staffWithPerm: { id: string; role: string };
  let staffNoPerm: { id: string; role: string };

  function tokenFor(user: { id: string; role: string }, shopIdArg: string): string {
    return sign(
      { role: user.role, barbershopId: shopIdArg },
      auth.secret as Secret,
      { subject: user.id, expiresIn: "1h" },
    );
  }

  function authHeader(user: { id: string; role: string }, shopIdArg: string) {
    return { authorization: `Bearer ${tokenFor(user, shopIdArg)}` };
  }

  beforeAll(async () => {
    harness = await startPostgresHarness();
    const helpers = await import("../helpers/createTestApp");
    closeTestApp = helpers.closeTestApp;
    app = await helpers.createTestApp();
    prisma = createProbePrisma();

    const shop = await prisma.barbershop.create({
      data: { name: "QA Products A", whatsapp: "11900000011" },
    });
    shopId = shop.id;
    const otherShop = await prisma.barbershop.create({
      data: { name: "QA Products B", whatsapp: "11900000012" },
    });
    otherShopId = otherShop.id;

    owner = await prisma.user.create({
      data: {
        name: "Owner Products QA",
        email: `ownerp-${randomUUID()}@qa.local`,
        password: "x",
        role: "OWNER",
        barbershopId: shopId,
        permissions: [],
      },
      select: { id: true, role: true },
    });
    otherOwner = await prisma.user.create({
      data: {
        name: "Owner Outro QA",
        email: `ownerx-${randomUUID()}@qa.local`,
        password: "x",
        role: "OWNER",
        barbershopId: otherShopId,
        permissions: [],
      },
      select: { id: true, role: true },
    });
    staffWithPerm = await prisma.user.create({
      data: {
        name: "Staff Products Perm QA",
        email: `staffpp-${randomUUID()}@qa.local`,
        password: "x",
        role: "EMPLOYEE",
        barbershopId: shopId,
        permissions: ["PRODUCTS_VIEW"],
      },
      select: { id: true, role: true },
    });
    staffNoPerm = await prisma.user.create({
      data: {
        name: "Staff Products SemPerm QA",
        email: `staffpn-${randomUUID()}@qa.local`,
        password: "x",
        role: "EMPLOYEE",
        barbershopId: shopId,
        permissions: [],
      },
      select: { id: true, role: true },
    });

    const product = await prisma.product.create({
      data: {
        barbershopId: shopId,
        name: "Shampoo QA",
        salePrice: 39.9,
        stockQty: 5,
      },
      select: { id: true },
    });
    productId = product.id;
  }, 180_000);

  afterAll(async () => {
    try {
      if (prisma && shopId) {
        await prisma.barbershop.deleteMany({
          where: { id: { in: [shopId, otherShopId] } },
        });
      }
    } catch { /* limpeza best-effort */ }
    if (app && closeTestApp) await closeTestApp(app);
    if (prisma) await prisma.$disconnect();
    if (harness) await harness.stop();
  });

  it("OWNER (permissions vazio) acessa products e estoque com 200", async () => {
    const products = await app.inject({
      method: "GET",
      url: "/api/products",
      headers: authHeader(owner, shopId),
    });
    expect(products.statusCode).toBe(200);
    expect(products.json()).toMatchObject({ success: true });

    const movements = await app.inject({
      method: "GET",
      url: "/api/inventory/movements",
      headers: authHeader(owner, shopId),
    });
    expect(movements.statusCode).toBe(200);

    const receipts = await app.inject({
      method: "GET",
      url: "/api/inventory/receipts",
      headers: authHeader(owner, shopId),
    });
    expect(receipts.statusCode).toBe(200);
  });

  it("EMPLOYEE sem permissão de products recebe 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/products",
      headers: authHeader(staffNoPerm, shopId),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false });
  });

  it("EMPLOYEE com PRODUCTS_VIEW acessa products com 200", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/products",
      headers: authHeader(staffWithPerm, shopId),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true });
  });

  it("OWNER de outro salão não enxerga os produtos deste salão", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/products",
      headers: authHeader(otherOwner, otherShopId),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ id: string }> };
    expect(body.data.find((p) => p.id === productId)).toBeUndefined();
  });
});
