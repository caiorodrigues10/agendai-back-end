/// <reference types="vitest/globals" />
/**
 * Snapshot de pet no agendamento e na fila (MVP petshop).
 *
 * O que só um teste real pega: `resolvePetSnapshot` valida o pet contra o
 * tenant no Postgres (pet de outro salão → 400), o nome gravado vem do
 * banco (não do payload) e o snapshot sobrevive à exclusão do pet.
 *
 * Requer Postgres local (docker-compose, porta 5442) via `.env`.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { resolvePetSnapshot } from "@/modules/clients/utils/resolvePetSnapshot";
import { QueueRepository } from "@/modules/queue/infra/repositories/QueueRepository";

describe("snapshot de pet no agendamento/fila (Postgres real)", () => {
  const queueRepo = new QueueRepository();
  const shopA = randomUUID();
  const shopB = randomUUID();
  const serviceId = randomUUID();
  let clientA: string;
  let petA: string;
  let petB: string;

  beforeAll(async () => {
    await prisma.barbershop.createMany({
      data: [
        {
          id: shopA,
          name: `[QA-PETSNAP] A ${shopA.slice(0, 8)}`,
          whatsapp: "11999990201",
          operationMode: "QUEUE_ONLY",
          approvalStatus: "APPROVED",
          active: true,
          businessSegment: "PETSHOP",
          evolutionInstanceName: `[QA-PETSNAP] a-${shopA.slice(0, 8)}`,
        },
        {
          id: shopB,
          name: `[QA-PETSNAP] B ${shopB.slice(0, 8)}`,
          whatsapp: "11999990202",
          operationMode: "QUEUE_ONLY",
          approvalStatus: "APPROVED",
          active: true,
          businessSegment: "PETSHOP",
          evolutionInstanceName: `[QA-PETSNAP] b-${shopB.slice(0, 8)}`,
        },
      ],
    });
    await prisma.service.create({
      data: {
        id: serviceId,
        barbershopId: shopA,
        name: "[QA-PETSNAP] Banho",
        price: 60,
        avgTimeMinutes: 45,
        icon: "scissors",
        active: true,
      },
    });
    const client = await prisma.salonClient.create({
      data: { barbershopId: shopA, name: "[QA-PETSNAP] Tutor", whatsapp: "11999990211" },
    });
    clientA = client.id;
    const pa = await prisma.clientPet.create({
      data: { barbershopId: shopA, clientId: clientA, name: "Thor", species: "DOG" },
    });
    petA = pa.id;
    const pb = await prisma.clientPet.create({
      data: {
        barbershopId: shopB,
        clientId: (await prisma.salonClient.create({
          data: { barbershopId: shopB, name: "[QA-PETSNAP] Tutor B", whatsapp: "11999990222" },
        })).id,
        name: "Luna",
        species: "CAT",
      },
    });
    petB = pb.id;
  });

  afterAll(async () => {
    await prisma.clientPet.deleteMany({ where: { barbershopId: { in: [shopA, shopB] } } });
    await prisma.queueItem.deleteMany({ where: { barbershopId: { in: [shopA, shopB] } } });
    await prisma.service.deleteMany({ where: { barbershopId: shopA } });
    await prisma.salonClient.deleteMany({ where: { barbershopId: { in: [shopA, shopB] } } });
    await prisma.barbershop.deleteMany({ where: { id: { in: [shopA, shopB] } } }).catch(() => undefined);
  });

  it("resolve o nome do banco e rejeita pet de outro tenant", async () => {
    const ok = await resolvePetSnapshot(shopA, petA);
    expect(ok).toEqual({ petId: petA, petName: "Thor" });

    await expect(resolvePetSnapshot(shopA, petB)).rejects.toThrow(/Pet inválido/i);
    await expect(resolvePetSnapshot(shopA, randomUUID())).rejects.toThrow(/Pet inválido/i);
    expect(await resolvePetSnapshot(shopA, null)).toEqual({ petId: null, petName: null });
  });

  it("grava o snapshot na fila e ele sobrevive à exclusão do pet", async () => {
    // Mesmo fluxo do JoinQueueUseCase: resolve o snapshot e grava o par.
    const pet = await resolvePetSnapshot(shopA, petA);
    const item = await queueRepo.create({
      barbershopId: shopA,
      serviceId,
      customerId: randomUUID(),
      customerName: "[QA-PETSNAP] Tutor",
      whatsapp: "11999990211",
      ...pet,
    });

    expect(item.petId).toBe(petA);
    expect(item.petName).toBe("Thor");

    // Snapshot: apagar o pet não apaga o nome gravado no item da fila.
    await prisma.clientPet.delete({ where: { id: petA } });
    const after = await queueRepo.findById(item.id);
    expect(after?.petName).toBe("Thor");
    expect(after?.petId).toBe(petA);
  });
});
