/// <reference types="vitest/globals" />
/**
 * Troca de segmento depois do cadastro (PATCH /barbershops/:id).
 *
 * O que só um teste real pega: o par segmento/público precisa ser normalizado
 * no repositório real (PETSHOP zera o público herdado da barbearia; um petshop
 * que recebe só "targetAudience" não grava público nenhum), os serviços já
 * criados não podem sumir na troca e a leitura pública precisa devolver o
 * par sem expor `evolutionInstanceName`.
 *
 * Requer Postgres local (docker-compose, porta 5442) via `.env`.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { BarbershopRepository } from "@/modules/barbershops/infra/repositories/BarbershopRepository";
import { UpdateBarbershopUseCase } from "@/modules/barbershops/useCases/updateBarbershop/UpdateBarbershopUseCase";

describe("troca de segmento do salão (Postgres real)", () => {
  const repo = new BarbershopRepository();
  const useCase = new UpdateBarbershopUseCase(repo);
  const shopId = randomUUID();
  const owner = { id: randomUUID(), role: "OWNER", barbershopId: shopId };
  const SERVICE = `[QA-SEG] Corte existente`;

  beforeAll(async () => {
    await prisma.barbershop.create({
      data: {
        id: shopId,
        name: `[QA-SEG] ${shopId.slice(0, 8)}`,
        whatsapp: "11999990097",
        operationMode: "QUEUE_ONLY",
        approvalStatus: "APPROVED",
        active: true,
        businessSegment: "BARBERSHOP",
        targetAudience: "MASCULINO",
        evolutionInstanceName: `[QA-SEG] inst-${shopId.slice(0, 8)}`,
        services: { create: { name: SERVICE, price: 50, avgTimeMinutes: 30, icon: "scissors" } },
      },
    });
  });

  afterAll(async () => {
    await prisma.service.deleteMany({ where: { barbershopId: shopId } });
    await prisma.barbershop.delete({ where: { id: shopId } }).catch(() => undefined);
  });

  it("BARBERSHOP -> PETSHOP zera o público e NÃO apaga serviços existentes", async () => {
    await useCase.execute(shopId, { businessSegment: "PETSHOP" }, owner);

    const shop = await prisma.barbershop.findUniqueOrThrow({ where: { id: shopId } });
    expect(shop.businessSegment).toBe("PETSHOP");
    expect(shop.targetAudience).toBeNull();

    const services = await prisma.service.findMany({ where: { barbershopId: shopId } });
    expect(services.map((s) => s.name)).toContain(SERVICE);
  });

  it("só o targetAudience num petshop é normalizado para null, não gravado", async () => {
    await useCase.execute(shopId, { targetAudience: "FEMININO" }, owner);

    const shop = await prisma.barbershop.findUniqueOrThrow({ where: { id: shopId } });
    expect(shop.targetAudience).toBeNull();
  });

  it("PETSHOP -> BARBERSHOP aplica o público sugerido", async () => {
    await useCase.execute(shopId, { businessSegment: "BARBERSHOP" }, owner);

    const shop = await prisma.barbershop.findUniqueOrThrow({ where: { id: shopId } });
    expect(shop.businessSegment).toBe("BARBERSHOP");
    expect(shop.targetAudience).toBe("MASCULINO");
  });

  it("a leitura pública devolve o par segmento/público e esconde a instância Evolution", async () => {
    const shop = await repo.findByIdPublic(shopId);

    expect(shop?.businessSegment).toBe("BARBERSHOP");
    expect(shop?.targetAudience).toBe("MASCULINO");
    expect(shop).not.toHaveProperty("evolutionInstanceName");
  });

  it("recusa OWNER de outro salão (IDOR continua coberto com os campos novos)", async () => {
    await expect(
      useCase.execute(shopId, { businessSegment: "NAIL_STUDIO" }, {
        id: randomUUID(),
        role: "OWNER",
        barbershopId: randomUUID(),
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    const shop = await prisma.barbershop.findUniqueOrThrow({ where: { id: shopId } });
    expect(shop.businessSegment).toBe("BARBERSHOP");
  });

  it("OTHER guarda o texto livre normalizado; trocar de segmento zera", async () => {
    await useCase.execute(
      shopId,
      { businessSegment: "OTHER", businessSegmentOther: "  Estúdio   de tatuagem\tcom piercing  " },
      owner
    );

    const withOther = await prisma.barbershop.findUniqueOrThrow({ where: { id: shopId } });
    expect(withOther.businessSegment).toBe("OTHER");
    expect(withOther.businessSegmentOther).toBe("Estúdio de tatuagem com piercing");

    // Sair de OTHER zera o texto — não fica lixo de um segmento antigo.
    await useCase.execute(shopId, { businessSegment: "HAIR_SALON" }, owner);
    const left = await prisma.barbershop.findUniqueOrThrow({ where: { id: shopId } });
    expect(left.businessSegment).toBe("HAIR_SALON");
    expect(left.businessSegmentOther).toBeNull();
  });

  it("a leitura pública NÃO expõe businessSegmentOther (só interna)", async () => {
    await useCase.execute(
      shopId,
      { businessSegment: "OTHER", businessSegmentOther: "Segredo do dono" },
      owner
    );

    const publicShop = await repo.findByIdPublic(shopId);
    expect(publicShop).not.toHaveProperty("businessSegmentOther");

    const internalShop = await repo.findById(shopId);
    expect(internalShop?.businessSegmentOther).toBe("Segredo do dono");
  });
});
