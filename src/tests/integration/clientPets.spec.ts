/// <reference types="vitest/globals" />
/**
 * CRUD de pets por cliente (MVP petshop).
 *
 * O que só um teste real pega: a tabela nova com RLS/tenant isola pets de
 * salões diferentes no banco real (um pet de outro tenant não aparece nem
 * pode ser atualizado), os defaults do schema (espécie OTHER, ativo) são
 * aplicados pelo Postgres e o use case bloqueia papel que não é staff.
 *
 * Requer Postgres local (docker-compose, porta 5442) via `.env`.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { ClientPetRepository } from "@/modules/clients/repositories/ClientPetRepository";
import {
  CreateClientPetUseCase,
  ListClientPetsUseCase,
  UpdateClientPetUseCase,
  DeleteClientPetUseCase,
} from "@/modules/clients/useCases/pets/petUseCases";

describe("CRUD de pets do cliente (Postgres real)", () => {
  const repo = new ClientPetRepository();
  const createCase = new CreateClientPetUseCase(repo);
  const listCase = new ListClientPetsUseCase(repo);
  const updateCase = new UpdateClientPetUseCase(repo);
  const deleteCase = new DeleteClientPetUseCase(repo);

  const shopA = randomUUID();
  const shopB = randomUUID();
  const ownerA = { id: randomUUID(), role: "OWNER", barbershopId: shopA };
  const ownerB = { id: randomUUID(), role: "OWNER", barbershopId: shopB };
  let clientA: string;
  let clientB: string;

  beforeAll(async () => {
    await prisma.barbershop.createMany({
      data: [
        {
          id: shopA,
          name: `[QA-PET] A ${shopA.slice(0, 8)}`,
          whatsapp: "11999990101",
          operationMode: "QUEUE_ONLY",
          approvalStatus: "APPROVED",
          active: true,
          businessSegment: "PETSHOP",
          evolutionInstanceName: `[QA-PET] a-${shopA.slice(0, 8)}`,
        },
        {
          id: shopB,
          name: `[QA-PET] B ${shopB.slice(0, 8)}`,
          whatsapp: "11999990102",
          operationMode: "QUEUE_ONLY",
          approvalStatus: "APPROVED",
          active: true,
          businessSegment: "PETSHOP",
          evolutionInstanceName: `[QA-PET] b-${shopB.slice(0, 8)}`,
        },
      ],
    });

    const { count } = await prisma.salonClient.createMany({
      data: [
        { barbershopId: shopA, name: "[QA-PET] Tutor A", whatsapp: "11999990111" },
        { barbershopId: shopB, name: "[QA-PET] Tutor B", whatsapp: "11999990122" },
      ],
    });
    expect(count).toBe(2);
    const createdA = await prisma.salonClient.findFirstOrThrow({
      where: { barbershopId: shopA, name: "[QA-PET] Tutor A" },
    });
    const createdB = await prisma.salonClient.findFirstOrThrow({
      where: { barbershopId: shopB, name: "[QA-PET] Tutor B" },
    });
    clientA = createdA.id;
    clientB = createdB.id;
  });

  afterAll(async () => {
    await prisma.clientPet.deleteMany({ where: { barbershopId: { in: [shopA, shopB] } } });
    await prisma.salonClient.deleteMany({ where: { barbershopId: { in: [shopA, shopB] } } });
    await prisma.barbershop.deleteMany({ where: { id: { in: [shopA, shopB] } } }).catch(() => undefined);
  });

  it("cria com defaults do schema (OTHER, ativo) e lista por tutor", async () => {
    const pet = await createCase.execute(
      { barbershopId: shopA, clientId: clientA, name: "Rex" },
      ownerA
    );

    expect(pet.id).toBeTruthy();
    expect(pet.species).toBe("OTHER");
    expect(pet.active).toBe(true);
    expect(pet.breed).toBeNull();
    expect(pet.size).toBeNull();

    const full = await updateCase.execute(
      pet.id,
      shopA,
      { species: "DOG", breed: "Labrador", size: "LARGE", coat: "curta" },
      ownerA
    );
    expect(full.species).toBe("DOG");
    expect(full.breed).toBe("Labrador");
    expect(full.size).toBe("LARGE");
    expect(full.coat).toBe("curta");

    const pets = await listCase.execute(shopA, clientA, ownerA);
    expect(pets.map((p) => p.name)).toContain("Rex");
  });

  it("isola por tenant: pet de outro salão não aparece nem pode ser atualizado", async () => {
    const petB = await createCase.execute(
      { barbershopId: shopB, clientId: clientB, name: "Mimi", species: "CAT" },
      ownerB
    );

    const visibleForA = await listCase.execute(shopA, clientB, ownerA);
    // Listagem de um cliente de outro tenant não pode devolver o pet de B
    // (o clientId de B não pertence a A; RLS + filtro barbershopId garantem).
    expect(visibleForA.map((p) => p.id)).not.toContain(petB.id);

    const cross = await repo.findById(petB.id, shopA);
    expect(cross).toBeNull();

    await expect(
      updateCase.execute(petB.id, shopA, { name: "hackeado" }, ownerA)
    ).rejects.toThrow(/não encontrado/i);
  });

  it("bloqueia papel que não é staff", async () => {
    const customer = { id: randomUUID(), role: "CUSTOMER", barbershopId: shopA };
    await expect(
      createCase.execute({ barbershopId: shopA, clientId: clientA, name: "Bloqueado" }, customer)
    ).rejects.toThrow(/profissionais/i);
  });

  it("remove o pet e a listagem fica vazia", async () => {
    const pet = await createCase.execute(
      { barbershopId: shopA, clientId: clientA, name: "Temporário" },
      ownerA
    );
    await deleteCase.execute(pet.id, shopA, ownerA);
    const pets = await listCase.execute(shopA, clientA, ownerA);
    expect(pets.map((p) => p.id)).not.toContain(pet.id);
  });
});
