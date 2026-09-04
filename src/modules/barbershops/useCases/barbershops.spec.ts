import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockBarbershopRepository } from "@/modules/barbershops/infra/repositories/mocks/MockBarbershopRepository";
import { CreateBarbershopUseCase } from "./createBarbershop/CreateBarbershopUseCase";
import { ListBarbershopsUseCase } from "./listBarbershops/ListBarbershopsUseCase";
import { GetBarbershopUseCase } from "./getBarbershop/GetBarbershopUseCase";
import { ListPublicStaffUseCase } from "./getBarbershop/ListPublicStaffUseCase";
import { UpdateBarbershopUseCase } from "./updateBarbershop/UpdateBarbershopUseCase";
import { DeleteBarbershopUseCase } from "./deleteBarbershop/DeleteBarbershopUseCase";
import { GetScheduleUseCase } from "./getSchedule/GetScheduleUseCase";
import { UpdateScheduleUseCase } from "./updateSchedule/UpdateScheduleUseCase";
import { AppError } from "@/shared/errors/AppError";

vi.mock("@/modules/barbershops/utils/getShopOpenState", () => ({
  getShopOpenState: vi.fn().mockResolvedValue({ open: true, reason: "SCHEDULE", queueClosed: false }),
  listUpcomingExceptions: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/shared/services/geocodeCity", () => ({
  geocodeCity: vi.fn(async (city: string) => ({
    city,
    latitude: -20.949,
    longitude: -48.479,
  })),
}));

let repo: MockBarbershopRepository;
let create: CreateBarbershopUseCase;
let list: ListBarbershopsUseCase;
let get: GetBarbershopUseCase;
let update: UpdateBarbershopUseCase;
let del: DeleteBarbershopUseCase;
let getSchedule: GetScheduleUseCase;
let updateSchedule: UpdateScheduleUseCase;

beforeEach(() => {
  repo = new MockBarbershopRepository();
  create = new CreateBarbershopUseCase(repo as any);
  list = new ListBarbershopsUseCase(repo as any);
  get = new GetBarbershopUseCase(repo as any);
  update = new UpdateBarbershopUseCase(repo as any);
  del = new DeleteBarbershopUseCase(repo as any);
  getSchedule = new GetScheduleUseCase(repo as any);
  updateSchedule = new UpdateScheduleUseCase(repo as any);
});

describe("Barbershops module", () => {
  it("cria, lista, busca e atualiza barbearia", async () => {
    const b = await create.execute({ name: "Barber X", whatsapp: "5599999999999", logoUrl: "http://x/logo.png" });
    const items = await list.execute();
    expect(items.length).toBe(1);
    const fetched = await get.execute(b.id);
    expect(fetched.name).toBe("Barber X");
    const updated = await update.execute(b.id, { name: "Barber Y" });
    expect(updated.name).toBe("Barber Y");
  });

  it("deleta (desativa) barbearia", async () => {
    const b = await create.execute({ name: "B", whatsapp: "55", logoUrl: undefined });
    await del.execute(b.id);
    const fetched = await repo.findById(b.id);
    expect(fetched?.active).toBe(false);
  });

  it("agenda: atualiza e busca", async () => {
    const b = await create.execute({ name: "Sched", whatsapp: "55" });
    await updateSchedule.execute(b.id, [{ dayOfWeek: 1, isOpen: true, openTime: "09:00", closeTime: "18:00" }]);
    const sched = await getSchedule.execute(b.id);
    expect(sched.length).toBe(1);
    expect(sched[0].dayOfWeek).toBe(1);
  });

  it("lança erro ao buscar id inexistente", async () => {
    await expect(get.execute("not-found")).rejects.toBeInstanceOf(AppError);
  });

  it("equipe pública: 404 se o salão não existe", async () => {
    const listStaff = new ListPublicStaffUseCase(repo as any);
    await expect(listStaff.execute("not-found")).rejects.toBeInstanceOf(AppError);
  });

  it("geocodifica a cidade quando faltam coordenadas", async () => {
    const b = await create.execute({ name: "Geo", whatsapp: "55" });
    const updated = await update.execute(b.id, { city: "Bebedouro" });
    expect(updated.city).toBe("Bebedouro");
    expect(updated.latitude).toBe(-20.949);
    expect(updated.longitude).toBe(-48.479);
  });
});
