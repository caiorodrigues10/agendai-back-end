/// <reference types="vitest/globals" />
/**
 * CRUD de veículos por cliente (MVP automotivo).
 *
 * Espelha `clientPets.spec.ts`: um teste real pega o que o mock não pega —
 * a tabela nova com RLS isola veículos de salões diferentes, a unicidade de
 * placa por cliente é aplicada pelo Postgres, a normalização de placa vem do
 * Zod (não do use case) e o papel que não é staff é bloqueado.
 *
 * Requer Postgres local (docker-compose, porta 5442) via `.env`.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/libs/prismaClient";
import { ClientVehicleRepository } from "@/modules/clients/repositories/ClientVehicleRepository";
import { createVehicleSchema } from "@/modules/clients/schemas/vehicleSchemas";
import {
  CreateClientVehicleUseCase,
  ListClientVehiclesUseCase,
  UpdateClientVehicleUseCase,
  DeleteClientVehicleUseCase,
} from "@/modules/clients/useCases/vehicles/vehicleUseCases";

describe("CRUD de veículos do cliente (Postgres real)", () => {
  const repo = new ClientVehicleRepository();
  const createCase = new CreateClientVehicleUseCase(repo);
  const listCase = new ListClientVehiclesUseCase(repo);
  const updateCase = new UpdateClientVehicleUseCase(repo);
  const deleteCase = new DeleteClientVehicleUseCase(repo);

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
          name: `[QA-VEHICLE] A ${shopA.slice(0, 8)}`,
          whatsapp: "11999990201",
          operationMode: "QUEUE_ONLY",
          approvalStatus: "APPROVED",
          active: true,
          businessSegment: "CAR_WASH",
          evolutionInstanceName: `[QA-VEHICLE] a-${shopA.slice(0, 8)}`,
        },
        {
          id: shopB,
          name: `[QA-VEHICLE] B ${shopB.slice(0, 8)}`,
          whatsapp: "11999990202",
          operationMode: "QUEUE_ONLY",
          approvalStatus: "APPROVED",
          active: true,
          businessSegment: "AUTO_REPAIR",
          evolutionInstanceName: `[QA-VEHICLE] b-${shopB.slice(0, 8)}`,
        },
      ],
    });

    const { count } = await prisma.salonClient.createMany({
      data: [
        { barbershopId: shopA, name: "[QA-VEHICLE] Cliente A", whatsapp: "11999990211" },
        { barbershopId: shopB, name: "[QA-VEHICLE] Cliente B", whatsapp: "11999990222" },
      ],
    });
    expect(count).toBe(2);
    const createdA = await prisma.salonClient.findFirstOrThrow({
      where: { barbershopId: shopA, name: "[QA-VEHICLE] Cliente A" },
    });
    const createdB = await prisma.salonClient.findFirstOrThrow({
      where: { barbershopId: shopB, name: "[QA-VEHICLE] Cliente B" },
    });
    clientA = createdA.id;
    clientB = createdB.id;
  });

  afterAll(async () => {
    await prisma.clientVehicle.deleteMany({ where: { barbershopId: { in: [shopA, shopB] } } });
    await prisma.salonClient.deleteMany({ where: { barbershopId: { in: [shopA, shopB] } } });
    await prisma.barbershop.deleteMany({ where: { id: { in: [shopA, shopB] } } }).catch(() => undefined);
  });

  it("normaliza a placa no Zod e cria com defaults (ativo, sem cor/observações)", async () => {
    const parsed = createVehicleSchema.parse({ plate: " abc-1d23 ", vehicleModel: "Honda CG 160" });
    expect(parsed.plate).toBe("ABC1D23");

    const vehicle = await createCase.execute(
      { barbershopId: shopA, clientId: clientA, ...parsed },
      ownerA
    );

    expect(vehicle.id).toBeTruthy();
    expect(vehicle.plate).toBe("ABC1D23");
    expect(vehicle.vehicleModel).toBe("Honda CG 160");
    expect(vehicle.active).toBe(true);
    expect(vehicle.color).toBeNull();
    expect(vehicle.notes).toBeNull();

    const full = await updateCase.execute(
      vehicle.id,
      shopA,
      { color: "preto", notes: "teto solar" },
      ownerA
    );
    expect(full.color).toBe("preto");
    expect(full.notes).toBe("teto solar");

    const vehicles = await listCase.execute(shopA, clientA, ownerA);
    expect(vehicles.map((v) => v.plate)).toContain("ABC1D23");
  });

  it("recusa a mesma placa duas vezes para o mesmo cliente (unicidade do banco)", async () => {
    const parsed = createVehicleSchema.parse({ plate: "XYZ1A23", vehicleModel: "Gol 1.6" });
    await createCase.execute({ barbershopId: shopA, clientId: clientA, ...parsed }, ownerA);

    await expect(
      createCase.execute(
        { barbershopId: shopA, clientId: clientA, ...parsed },
        ownerA
      )
    ).rejects.toThrow(/já tem este veículo/i);

    // A tabela tem a constraint também: se o use case escapar, o Postgres pega.
    const raw = await repo.findByPlate(shopA, clientA, "XYZ1A23");
    expect(raw).not.toBeNull();
  });

  it("isola por tenant: veículo de outro salão não aparece nem pode ser atualizado", async () => {
    const vehicleB = await createCase.execute(
      {
        barbershopId: shopB,
        clientId: clientB,
        plate: "RIDE001",
        vehicleModel: "Corolla XEi",
      },
      ownerB
    );

    const visibleForA = await listCase.execute(shopA, clientB, ownerA);
    expect(visibleForA.map((v) => v.id)).not.toContain(vehicleB.id);

    const cross = await repo.findById(vehicleB.id, shopA);
    expect(cross).toBeNull();

    await expect(
      updateCase.execute(vehicleB.id, shopA, { vehicleModel: "hackeado" }, ownerA)
    ).rejects.toThrow(/não encontrado/i);
  });

  it("bloqueia papel que não é staff", async () => {
    const customer = { id: randomUUID(), role: "CUSTOMER", barbershopId: shopA };
    await expect(
      createCase.execute(
        { barbershopId: shopA, clientId: clientA, plate: "BLOCK01", vehicleModel: "Fiat Mobi" },
        customer
      )
    ).rejects.toThrow(/profissionais/i);
  });

  it("remove o veículo e a listagem fica vazia", async () => {
    const vehicle = await createCase.execute(
      { barbershopId: shopA, clientId: clientA, plate: "GONE001", vehicleModel: "Uno" },
      ownerA
    );
    await deleteCase.execute(vehicle.id, shopA, ownerA);
    const vehicles = await listCase.execute(shopA, clientA, ownerA);
    expect(vehicles.map((v) => v.id)).not.toContain(vehicle.id);
  });
});
