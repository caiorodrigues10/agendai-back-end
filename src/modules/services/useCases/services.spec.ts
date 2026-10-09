/// <reference types="vitest/globals" />
import { MockServiceRepository } from "@/modules/services/infra/repositories/mocks/MockServiceRepository";
import { CreateServiceUseCase } from "./createService/CreateServiceUseCase";
import { ListServicesUseCase } from "./listServices/ListServicesUseCase";
import { GetServiceUseCase } from "./getService/GetServiceUseCase";
import { UpdateServiceUseCase } from "./updateService/UpdateServiceUseCase";
import { DeleteServiceUseCase } from "./deleteService/DeleteServiceUseCase";
import { AppError } from "@/shared/errors/AppError";

const categoryRepo = { findById: vi.fn() };
let repo: MockServiceRepository;
let create: CreateServiceUseCase;
let list: ListServicesUseCase;
let get: GetServiceUseCase;
let update: UpdateServiceUseCase;
let del: DeleteServiceUseCase;

const OWNER_SHOP1 = { id: "u-1", role: "OWNER", barbershopId: "shop-1" };
const OWNER_SHOP2 = { id: "u-2", role: "OWNER", barbershopId: "shop-2" };
const MASTER = { id: "u-m", role: "MASTER_ADMIN" };

beforeEach(() => {
  repo = new MockServiceRepository();
  create = new CreateServiceUseCase(repo as any, categoryRepo as any);
  list = new ListServicesUseCase(repo as any);
  get = new GetServiceUseCase(repo as any);
  update = new UpdateServiceUseCase(repo as any, categoryRepo as any);
  del = new DeleteServiceUseCase(repo as any);
});

describe("Services module", () => {
  it("cria e lista serviços por barbearia", async () => {
    const s1 = await create.execute({ barbershopId: "shop-1", name: "Corte", price: 50, avgTimeMinutes: 30, icon: "scissors" }, OWNER_SHOP1);
    const s2 = await create.execute({ barbershopId: "shop-2", name: "Barba", price: 40, avgTimeMinutes: 20, icon: "beard" }, OWNER_SHOP2);
    const listAll = await list.execute();
    expect(listAll.length).toBe(0);
    const listShop1 = await list.execute("shop-1");
    expect(listShop1.length).toBe(1);
    expect(listShop1[0].id).toBe(s1.id);
  });

  it("obtém serviço por id e atualiza", async () => {
    const s = await create.execute({ barbershopId: "shop-1", name: "Corte", price: 50, avgTimeMinutes: 30, icon: "scissors" }, OWNER_SHOP1);
    const fetched = await get.execute(s.id);
    expect(fetched.name).toBe("Corte");
    const updated = await update.execute(s.id, { price: 55 }, OWNER_SHOP1);
    expect(updated.price).toBe(55);
  });

  it("não permite obter serviço de outro tenant quando escopado", async () => {
    const s = await create.execute({ barbershopId: "shop-1", name: "Corte", price: 50, avgTimeMinutes: 30, icon: "scissors" }, OWNER_SHOP1);
    await expect(get.execute(s.id, "shop-2")).rejects.toMatchObject({ statusCode: 404 });
    await expect(get.execute(s.id, "shop-1")).resolves.toMatchObject({ id: s.id });
  });

  it("desativa serviço", async () => {
    const s = await create.execute({ barbershopId: "shop-1", name: "Corte", price: 50, avgTimeMinutes: 30, icon: "scissors" }, OWNER_SHOP1);
    await del.execute(s.id, OWNER_SHOP1);
    const fetched = await repo.findById(s.id);
    expect(fetched?.active).toBe(false);
  });

  it("lança erro ao buscar id inexistente", async () => {
    await expect(get.execute("not-found")).rejects.toBeInstanceOf(AppError);
  });
});

describe('Vínculos de categorias', () => {
  it.each([null, { barbershopId: 'outro-salao', active: true }, { barbershopId: 'shop-1', active: false }])('rejeita categoria indisponível %j', async category => {
    categoryRepo.findById.mockResolvedValue(category);
    const body = { barbershopId: 'shop-1', name: 'Corte', price: 50, avgTimeMinutes: 30, icon: 'scissors' };
    await expect(create.execute({ ...body, categoryId: 'cat-1' }, OWNER_SHOP1)).rejects.toMatchObject({ statusCode: 400 });
    const service = await create.execute(body, OWNER_SHOP1);
    await expect(update.execute(service.id, { categoryId: 'cat-1' }, OWNER_SHOP1)).rejects.toMatchObject({ statusCode: 400 });
  });
  it.each([null, 'shop-1'])('aceita categoria global ou do salão %s e permite desvincular', async barbershopId => {
    categoryRepo.findById.mockResolvedValue({ barbershopId, active: true });
    const body = { barbershopId: 'shop-1', name: 'Corte', price: 50, avgTimeMinutes: 30, icon: 'scissors' };
    const service = await create.execute({ ...body, categoryId: 'cat-1' }, OWNER_SHOP1);
    expect(service.categoryId).toBe('cat-1');
    expect((await update.execute(service.id, { categoryId: null }, OWNER_SHOP1)).categoryId).toBeNull();
    expect(await get.execute(service.id)).toMatchObject({ name: 'Corte', active: true });
  });
});

describe('Isolamento de tenant (IDOR)', () => {
  const body = (barbershopId: string) => ({ barbershopId, name: 'Corte', price: 50, avgTimeMinutes: 30, icon: 'scissors' });

  it('criar serviço apontando para salão de outro tenant é 403', async () => {
    await expect(create.execute(body('shop-2'), OWNER_SHOP1)).rejects.toMatchObject({ statusCode: 403 });
    expect((await list.execute('shop-2')).length).toBe(0);
  });

  it('atualizar serviço de outro tenant é 403 e não altera nada', async () => {
    const victim = await create.execute(body('shop-2'), OWNER_SHOP2);
    await expect(update.execute(victim.id, { price: 999, name: 'hackeado' }, OWNER_SHOP1))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(await repo.findById(victim.id)).toMatchObject({ price: 50, name: 'Corte' });
  });

  it('desativar serviço de outro tenant é 403 e mantém ativo', async () => {
    const victim = await create.execute(body('shop-2'), OWNER_SHOP2);
    await expect(del.execute(victim.id, OWNER_SHOP1)).rejects.toMatchObject({ statusCode: 403 });
    expect((await repo.findById(victim.id))?.active).toBe(true);
  });

  it('MASTER_ADMIN pode criar, atualizar e desativar em qualquer salão', async () => {
    const s = await create.execute(body('shop-2'), MASTER);
    expect(s.barbershopId).toBe('shop-2');
    expect((await update.execute(s.id, { price: 60 }, MASTER)).price).toBe(60);
    await del.execute(s.id, MASTER);
    expect((await repo.findById(s.id))?.active).toBe(false);
  });

  it('serviço inexistente continua 404 sem consulta de acesso', async () => {
    await expect(update.execute('not-found', { price: 1 }, OWNER_SHOP1)).rejects.toMatchObject({ statusCode: 404 });
    await expect(del.execute('not-found', OWNER_SHOP1)).rejects.toMatchObject({ statusCode: 404 });
  });
});
