import { describe, expect, it } from "vitest";
import { MockServiceRepository } from "./MockServiceRepository";

const SHOP = "barbershop-1";
const OTHER_SHOP = "barbershop-2";

async function seed() {
  const repo = new MockServiceRepository();

  await repo.create({
    barbershopId: SHOP,
    name: "Corte Masculino",
    price: 40,
    avgTimeMinutes: 30,
    icon: "scissors",
    categoryId: "category-1",
  });
  await repo.create({
    barbershopId: SHOP,
    name: "Barba",
    price: 25,
    avgTimeMinutes: 20,
    icon: "razor",
    categoryId: "category-2",
  });
  await repo.create({
    barbershopId: SHOP,
    name: "Audiência",
    price: 60,
    avgTimeMinutes: 45,
    icon: "gavel",
    publicBookable: false,
  });
  await repo.create({
    barbershopId: OTHER_SHOP,
    name: "Corte Feminino",
    price: 60,
    avgTimeMinutes: 50,
    icon: "scissors",
  });

  return repo;
}

describe("MockServiceRepository.listPaginated", () => {
  it("pagina e conta o conjunto filtrado inteiro", async () => {
    const repo = await seed();

    const result = await repo.listPaginated(
      SHOP,
      { page: 1, limit: 2 },
      { includeInternal: true },
    );

    expect(result.total).toBe(3);
    expect(result.data).toHaveLength(2);
  });

  it("visão pública devolve só o que é agendável pelo cliente", async () => {
    const repo = await seed();

    const result = await repo.listPaginated(SHOP, { page: 1, limit: 20 });

    expect(result.total).toBe(2);
    expect(result.data.map((s) => s.name)).not.toContain("Audiência");
  });

  it("visão staff (includeInternal) devolve os serviços internos também", async () => {
    const repo = await seed();

    const result = await repo.listPaginated(
      SHOP,
      { page: 1, limit: 20 },
      { includeInternal: true },
    );

    expect(result.total).toBe(3);
    expect(result.data.map((s) => s.name)).toContain("Audiência");
  });

  it("nunca devolve serviço de outro salão", async () => {
    const repo = await seed();

    const result = await repo.listPaginated(
      SHOP,
      { page: 1, limit: 20 },
      { includeInternal: true },
    );

    expect(result.data.map((s) => s.barbershopId)).toEqual([SHOP, SHOP, SHOP]);
  });

  it("filtra por busca no nome, ignorando maiúsculas", async () => {
    const repo = await seed();

    const result = await repo.listPaginated(
      SHOP,
      { page: 1, limit: 20, search: "barba" },
      { includeInternal: true },
    );

    expect(result.total).toBe(1);
    expect(result.data[0].name).toBe("Barba");
  });

  it("filtra por categoria e por situação", async () => {
    const repo = await seed();

    const byCategory = await repo.listPaginated(
      SHOP,
      { page: 1, limit: 20, categoryId: "category-2" },
      { includeInternal: true },
    );
    expect(byCategory.total).toBe(1);
    expect(byCategory.data[0].name).toBe("Barba");

    await repo.deactivate("service-3");

    const inactive = await repo.listPaginated(
      SHOP,
      { page: 1, limit: 20, active: false },
      { includeInternal: true },
    );
    expect(inactive.total).toBe(1);
    expect(inactive.data[0].name).toBe("Audiência");
  });

  it("sem filtro de situação, serviço inativo continua aparecendo", async () => {
    const repo = await seed();
    await repo.deactivate("service-1");

    const result = await repo.listPaginated(
      SHOP,
      { page: 1, limit: 20 },
      { includeInternal: true },
    );

    expect(result.total).toBe(3);
    expect(result.data.map((s) => s.name)).toContain("Corte Masculino");
  });

  it("ordena por nome (padrão), preço, duração e criação", async () => {
    const repo = await seed();

    const byName = await repo.listPaginated(
      SHOP,
      { page: 1, limit: 20 },
      { includeInternal: true },
    );
    expect(byName.data.map((s) => s.name)).toEqual([
      "Audiência",
      "Barba",
      "Corte Masculino",
    ]);

    const byPrice = await repo.listPaginated(
      SHOP,
      { page: 1, limit: 20, sort: { field: "preco", dir: "asc" } },
      { includeInternal: true },
    );
    expect(byPrice.data.map((s) => s.price)).toEqual([25, 40, 60]);

    const byDuration = await repo.listPaginated(
      SHOP,
      { page: 1, limit: 20, sort: { field: "duracao", dir: "desc" } },
      { includeInternal: true },
    );
    expect(byDuration.data.map((s) => s.avgTimeMinutes)).toEqual([45, 30, 20]);
  });

  it("a página 2 devolve o restante sem repetir itens", async () => {
    const repo = await seed();

    const first = await repo.listPaginated(
      SHOP,
      { page: 1, limit: 2 },
      { includeInternal: true },
    );
    const second = await repo.listPaginated(
      SHOP,
      { page: 2, limit: 2 },
      { includeInternal: true },
    );

    expect(first.data).toHaveLength(2);
    expect(second.data).toHaveLength(1);
    expect(second.total).toBe(3);
    const ids = [...first.data, ...second.data].map((s) => s.id);
    expect(new Set(ids).size).toBe(3);
  });
});
