import { describe, expect, it } from "vitest";
import { MockUserRepository } from "./MockUserRepository";

const SHOP = "barbershop-1";
const OTHER_SHOP = "barbershop-2";

function makeRepo(): MockUserRepository {
  const repo = new MockUserRepository();

  repo.push({
    id: "user-1",
    name: "Ana Souza",
    email: "ana@shop.com",
    role: "OWNER",
    barbershopId: SHOP,
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
  });
  repo.push({
    id: "user-2",
    name: "Bruno Lima",
    email: "bruno@shop.com",
    role: "EMPLOYEE",
    barbershopId: SHOP,
    createdAt: new Date("2026-10-02T12:00:00.000Z"),
  });
  repo.push({
    id: "user-3",
    name: "Carla Dias",
    email: "carla@shop.com",
    role: "EMPLOYEE",
    barbershopId: SHOP,
    active: false,
    createdAt: new Date("2026-10-03T12:00:00.000Z"),
  });
  repo.push({
    id: "user-4",
    name: "_removido",
    email: "removido@shop.com",
    role: "EMPLOYEE",
    barbershopId: SHOP,
    active: false,
    deletedAt: new Date("2026-10-04T12:00:00.000Z"),
    createdAt: new Date("2026-10-04T12:00:00.000Z"),
  });
  repo.push({
    id: "user-5",
    name: "De outro salão",
    email: "de.outro@shop.com",
    role: "EMPLOYEE",
    barbershopId: OTHER_SHOP,
    createdAt: new Date("2026-10-05T12:00:00.000Z"),
  });

  return repo;
}

describe("MockUserRepository.list", () => {
  it("lista só o salão do contexto e esconde o membro removido", async () => {
    const repo = makeRepo();

    const result = await repo.list(SHOP, { page: 1, limit: 20 });

    expect(result.data.map((u) => u.id)).toEqual(["user-1", "user-2", "user-3"]);
    expect(result.total).toBe(3);
  });

  it("pagina: data é a página e total é o conjunto filtrado", async () => {
    const repo = makeRepo();

    const result = await repo.list(SHOP, { page: 2, limit: 2 });

    expect(result.data.map((u) => u.id)).toEqual(["user-3"]);
    expect(result.total).toBe(3);
  });

  it("filtra por papel", async () => {
    const repo = makeRepo();

    const result = await repo.list(SHOP, {
      page: 1,
      limit: 20,
      role: "EMPLOYEE",
    });

    expect(result.data.map((u) => u.id)).toEqual(["user-2", "user-3"]);
  });

  it("filtra por situação (active=false)", async () => {
    const repo = makeRepo();

    const result = await repo.list(SHOP, {
      page: 1,
      limit: 20,
      active: false,
    });

    expect(result.data.map((u) => u.id)).toEqual(["user-3"]);
  });

  it("busca por nome ou e-mail, sem diferenciar maiúsculas", async () => {
    const repo = makeRepo();

    const porNome = await repo.list(SHOP, {
      page: 1,
      limit: 20,
      search: "bruno",
    });
    const porEmail = await repo.list(SHOP, {
      page: 1,
      limit: 20,
      search: "ana@",
    });

    expect(porNome.data.map((u) => u.id)).toEqual(["user-2"]);
    expect(porEmail.data.map((u) => u.id)).toEqual(["user-1"]);
  });

  it("ordena por nome, email, cargo e criação (com desempate por id)", async () => {
    const repo = makeRepo();

    const porNome = await repo.list(SHOP, {
      page: 1,
      limit: 20,
      sort: { field: "nome", dir: "asc" },
    });
    const porEmail = await repo.list(SHOP, {
      page: 1,
      limit: 20,
      sort: { field: "email", dir: "asc" },
    });
    const porCargo = await repo.list(SHOP, {
      page: 1,
      limit: 20,
      sort: { field: "cargo", dir: "asc" },
    });
    const porCriado = await repo.list(SHOP, {
      page: 1,
      limit: 20,
      sort: { field: "criado", dir: "desc" },
    });

    expect(porNome.data.map((u) => u.id)).toEqual(["user-1", "user-2", "user-3"]);
    expect(porEmail.data.map((u) => u.id)).toEqual(["user-1", "user-2", "user-3"]);
    expect(porCargo.data.map((u) => u.id)).toEqual(["user-2", "user-3", "user-1"]);
    expect(porCriado.data.map((u) => u.id)).toEqual(["user-3", "user-2", "user-1"]);
  });

  it("sem sort: mantém o ordenamento atual (createdAt asc)", async () => {
    const repo = makeRepo();

    const result = await repo.list(SHOP, { page: 1, limit: 20 });

    expect(result.data.map((u) => u.id)).toEqual(["user-1", "user-2", "user-3"]);
  });

  it("o item da listagem não carrega cpf nem hash de senha", async () => {
    const repo = makeRepo();

    const result = await repo.list(SHOP, { page: 1, limit: 20 });

    expect(Object.keys(result.data[0]).sort()).toEqual([
      "active",
      "avatarUrl",
      "barbershopId",
      "createdAt",
      "email",
      "id",
      "name",
      "permissions",
      "role",
    ]);
  });
});
