/// <reference types="vitest/globals" />
/**
 * `GET /barbershops` e `GET /barbershops/:id` são rotas PÚBLICAS (sem
 * authenticate) — ver barbershops.routes.ts. Ambas passavam por `shopSelect`,
 * que inclui `evolutionInstanceName`: o nome da instância Evolution/WhatsApp,
 * identificador interno usado para parear e enviar mensagens
 * (WhatsAppConnectionUseCase, enqueueWhatsApp). Qualquer visitante listava a
 * instância de todos os salões.
 *
 * Correção: `publicShopSelect` (select sem o campo) aplicado a `list()` e ao
 * novo `findByIdPublic()`. `findById()` mantém o campo para os fluxos
 * autenticados (uploadLogo, changeOperationMode, ListPublicStaffUseCase...).
 *
 * Este teste exercita o repositório REAL contra Postgres: um mock não pegaria
 * o problema, pois quem definia o shape era o próprio mock.
 * Requer Postgres local (docker-compose, porta 5442) via `.env`.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { BarbershopRepository } from "@/modules/barbershops/infra/repositories/BarbershopRepository";

describe("leitura pública de salões não expõe evolutionInstanceName (Postgres real)", () => {
  const repo = new BarbershopRepository();
  const shopId = randomUUID();
  const INSTANCE = `[QA-PUBLIC-SELECT] inst-${shopId.slice(0, 8)}`;

  beforeAll(async () => {
    await prisma.barbershop.create({
      data: {
        id: shopId,
        name: `[QA-PUBLIC-SELECT] ${shopId.slice(0, 8)}`,
        whatsapp: "11999990098",
        operationMode: "HYBRID",
        approvalStatus: "APPROVED",
        active: true,
        evolutionInstanceName: INSTANCE,
      },
    });
  });

  afterAll(async () => {
    await prisma.barbershop.delete({ where: { id: shopId } }).catch(() => undefined);
  });

  it("findByIdPublic devolve o salão SEM o nome da instância", async () => {
    const shop = await repo.findByIdPublic(shopId);

    expect(shop).not.toBeNull();
    expect(shop?.id).toBe(shopId);
    expect(shop?.name).toContain("QA-PUBLIC-SELECT");
    expect(shop).not.toHaveProperty("evolutionInstanceName");
  });

  it("list (rota pública) devolve salões SEM o nome da instância", async () => {
    const list = await repo.list();
    const mine = list.find((shop) => shop.id === shopId);

    expect(mine).toBeDefined();
    expect(mine).not.toHaveProperty("evolutionInstanceName");
    for (const shop of list) {
      expect(shop).not.toHaveProperty("evolutionInstanceName");
    }
  });

  it("findById (fluxo autenticado) CONTINUA devolvendo o campo — não regredir", async () => {
    const shop = await repo.findById(shopId);

    expect(shop).not.toBeNull();
    expect(shop?.evolutionInstanceName).toBe(INSTANCE);
  });
});
