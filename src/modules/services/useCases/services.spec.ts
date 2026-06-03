import { describe, it, expect, beforeEach } from "vitest";
import { MockServiceRepository } from "@/modules/services/infra/repositories/mocks/MockServiceRepository";
import { CreateServiceUseCase } from "./createService/CreateServiceUseCase";
import { ListServicesUseCase } from "./listServices/ListServicesUseCase";
import { GetServiceUseCase } from "./getService/GetServiceUseCase";
import { UpdateServiceUseCase } from "./updateService/UpdateServiceUseCase";
import { DeleteServiceUseCase } from "./deleteService/DeleteServiceUseCase";
import { AppError } from "@/shared/errors/AppError";

let repo: MockServiceRepository;
let create: CreateServiceUseCase;
let list: ListServicesUseCase;
let get: GetServiceUseCase;
let update: UpdateServiceUseCase;
let del: DeleteServiceUseCase;

beforeEach(() => {
  repo = new MockServiceRepository();
  create = new CreateServiceUseCase(repo as any);
  list = new ListServicesUseCase(repo as any);
  get = new GetServiceUseCase(repo as any);
  update = new UpdateServiceUseCase(repo as any);
  del = new DeleteServiceUseCase(repo as any);
});

describe("Services module", () => {
  it("cria e lista serviços por barbearia", async () => {
    const s1 = await create.execute({ barbershopId: "shop-1", name: "Corte", price: 50, avgTimeMinutes: 30, icon: "scissors" });
    const s2 = await create.execute({ barbershopId: "shop-2", name: "Barba", price: 40, avgTimeMinutes: 20, icon: "beard" });
    const listAll = await list.execute();
    expect(listAll.length).toBe(2);
    const listShop1 = await list.execute("shop-1");
    expect(listShop1.length).toBe(1);
    expect(listShop1[0].id).toBe(s1.id);
  });

  it("obtém serviço por id e atualiza", async () => {
    const s = await create.execute({ barbershopId: "shop-1", name: "Corte", price: 50, avgTimeMinutes: 30, icon: "scissors" });
    const fetched = await get.execute(s.id);
    expect(fetched.name).toBe("Corte");
    const updated = await update.execute(s.id, { price: 55 });
    expect(updated.price).toBe(55);
  });

  it("desativa serviço", async () => {
    const s = await create.execute({ barbershopId: "shop-1", name: "Corte", price: 50, avgTimeMinutes: 30, icon: "scissors" });
    await del.execute(s.id);
    const fetched = await repo.findById(s.id);
    expect(fetched?.active).toBe(false);
  });

  it("lança erro ao buscar id inexistente", async () => {
    await expect(get.execute("not-found")).rejects.toBeInstanceOf(AppError);
  });
});
