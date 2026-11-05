import { describe, expect, it } from "vitest";
import { MockAdminTeamRepository } from "./MockAdminTeamRepository";

async function seed() {
  const repo = new MockAdminTeamRepository();

  const interno = await repo.createMember({
    name: "Caio Interno",
    email: "caio@agendai.com",
  });
  await repo.createMember({
    name: "Ana Interna",
    email: "ana@agendai.com",
    active: false,
  });
  await repo.createMember({
    name: "Removida Interna",
    email: "removida@agendai.com",
    active: false,
    deletedAt: new Date(),
  });
  const dono = await repo.createMember({
    name: "Dono Salão A",
    email: "dono-a@salon.com",
    role: "OWNER",
  });
  const funcionario = await repo.createMember({
    name: "Funcionario Salão B",
    email: "func-b@salon.com",
    role: "EMPLOYEE",
  });

  return { repo, interno, dono, funcionario };
}

describe("MockAdminTeamRepository.list", () => {
  it("sem role: só a equipe interna, sem o membro removido", async () => {
    const { repo } = await seed();

    const result = await repo.list({ page: 1, limit: 25 });

    expect(result.total).toBe(2);
    expect(result.users.map((u) => u.name)).toEqual([
      "Ana Interna",
      "Caio Interno",
    ]);
  });

  it("com role: o escopo passa a ser o papel pedido (admin vê mais que o dono)", async () => {
    const { repo, dono, funcionario } = await seed();

    const donos = await repo.list({ page: 1, limit: 25, role: "OWNER" });
    const funcionarios = await repo.list({ page: 1, limit: 25, role: "EMPLOYEE" });

    expect(donos.users.map((u) => u.id)).toEqual([dono.id]);
    expect(funcionarios.users.map((u) => u.id)).toEqual([funcionario.id]);
  });

  it("status=inactive: mostra desativado e removido", async () => {
    const { repo } = await seed();

    const result = await repo.list({ page: 1, limit: 25, status: "inactive" });

    expect(result.total).toBe(2);
    expect(result.users.map((u) => u.name).sort()).toEqual([
      "Ana Interna",
      "Removida Interna",
    ]);
  });

  it("status=active: só ativo e não removido", async () => {
    const { repo } = await seed();

    const result = await repo.list({ page: 1, limit: 25, status: "active" });

    expect(result.total).toBe(1);
    expect(result.users[0].name).toBe("Caio Interno");
  });

  it("busca por nome ou e-mail, ignorando maiúsculas", async () => {
    const { repo } = await seed();

    const porNome = await repo.list({ page: 1, limit: 25, search: "caio" });
    const porEmail = await repo.list({ page: 1, limit: 25, search: "ANA@" });

    expect(porNome.total).toBe(1);
    expect(porEmail.total).toBe(1);
  });

  it("pagina e conta o conjunto filtrado inteiro", async () => {
    const { repo } = await seed();

    const result = await repo.list({ page: 1, limit: 1 });

    expect(result.total).toBe(2);
    expect(result.users).toHaveLength(1);
  });

  it("ordena por nome (padrão é createdAt desc)", async () => {
    const { repo } = await seed();

    const porNome = await repo.list({
      page: 1,
      limit: 25,
      sort: { field: "nome", dir: "asc" },
    });

    expect(porNome.users.map((u) => u.name)).toEqual([
      "Ana Interna",
      "Caio Interno",
    ]);
  });

  it("mapeia os contadores de tickets e tarefas", async () => {
    const { repo } = await seed();

    const result = await repo.list({ page: 1, limit: 25 });

    expect(result.users[0]._count).toEqual({
      ticketsAssigned: 0,
      tasksAssigned: 0,
    });
  });
});

describe("MockAdminTeamRepository.listInvitations", () => {
  it("filtra por status e limita a 20", async () => {
    const repo = new MockAdminTeamRepository();

    await repo.createInvitation({ email: "pendente@agendai.com" });
    await repo.createInvitation({
      email: "expirado@agendai.com",
      status: "EXPIRED",
    });
    await repo.createInvitation({
      email: "revogado@agendai.com",
      status: "REVOKED",
    });

    const todos = await repo.listInvitations();
    const ativos = await repo.listInvitations("active");
    const inativos = await repo.listInvitations("inactive");

    expect(todos).toHaveLength(3);
    expect(ativos.map((i) => i.email)).toEqual(["pendente@agendai.com"]);
    expect(inativos.map((i) => i.email).sort()).toEqual([
      "expirado@agendai.com",
      "revogado@agendai.com",
    ]);
  });
});
