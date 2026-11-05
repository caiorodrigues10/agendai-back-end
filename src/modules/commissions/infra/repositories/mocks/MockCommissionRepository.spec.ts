import { describe, expect, it } from "vitest";
import { MockCommissionRepository } from "./MockCommissionRepository";

const SP = "America/Sao_Paulo";

function seed(repo: MockCommissionRepository): void {
  repo.push({
    id: "c1",
    barbershopId: "shop-1",
    queueItemId: "q1",
    professionalId: "pro-1",
    serviceId: "svc-1",
    amount: 20,
    sourceTotal: 50,
    createdAt: new Date("2026-10-05T13:00:00.000Z"),
  });
  repo.push({
    id: "c2",
    barbershopId: "shop-1",
    appointmentId: "a1",
    professionalId: "pro-2",
    serviceId: "svc-2",
    amount: 30,
    sourceTotal: 100,
    createdAt: new Date("2026-10-06T13:00:00.000Z"),
  });
  repo.push({
    id: "c3",
    barbershopId: "shop-2",
    queueItemId: "q9",
    professionalId: "pro-9",
    serviceId: "svc-9",
    amount: 99,
    createdAt: new Date("2026-10-06T13:00:00.000Z"),
  });
}

describe("modules/commissions — MockCommissionRepository.list", () => {
  it("filtra apenas o salão do contexto", async () => {
    const repo = new MockCommissionRepository();
    seed(repo);

    const result = await repo.list("shop-1", { page: 1, limit: 20 });
    expect(result.data.map((e) => e.id)).toEqual(["c2", "c1"]);
    expect(result.total).toBe(2);
  });

  it("professionalId/serviceId de outro salão devolvem lista vazia", async () => {
    const repo = new MockCommissionRepository();
    seed(repo);

    const porProfissionalAlheio = await repo.list("shop-1", {
      page: 1,
      limit: 20,
      professionalId: "pro-9",
    });
    expect(porProfissionalAlheio.data).toEqual([]);
    expect(porProfissionalAlheio.total).toBe(0);

    const porServicoAlheio = await repo.list("shop-1", {
      page: 1,
      limit: 20,
      serviceId: "svc-9",
    });
    expect(porServicoAlheio.data).toEqual([]);
    expect(porServicoAlheio.total).toBe(0);
  });

  it("filtra por profissional e serviço do próprio salão", async () => {
    const repo = new MockCommissionRepository();
    seed(repo);

    const porProfissional = await repo.list("shop-1", {
      page: 1,
      limit: 20,
      professionalId: "pro-1",
    });
    expect(porProfissional.data.map((e) => e.id)).toEqual(["c1"]);

    const porServico = await repo.list("shop-1", {
      page: 1,
      limit: 20,
      serviceId: "svc-2",
    });
    expect(porServico.data.map((e) => e.id)).toEqual(["c2"]);
  });

  it("período em createdAt inclui o último dia inteiro no fuso do salão", async () => {
    const repo = new MockCommissionRepository();
    seed(repo);

    const result = await repo.list("shop-1", {
      page: 1,
      limit: 20,
      from: "2026-10-06",
      to: "2026-10-06",
      timeZone: SP,
    });
    expect(result.data.map((e) => e.id)).toEqual(["c2"]);
    expect(result.total).toBe(1);
  });

  it("origin separa comissões de fila e de agenda", async () => {
    const repo = new MockCommissionRepository();
    seed(repo);

    const fila = await repo.list("shop-1", { page: 1, limit: 20, origin: "QUEUE" });
    expect(fila.data.map((e) => e.id)).toEqual(["c1"]);

    const agenda = await repo.list("shop-1", {
      page: 1,
      limit: 20,
      origin: "APPOINTMENT",
    });
    expect(agenda.data.map((e) => e.id)).toEqual(["c2"]);
  });

  it("sem sort mantém createdAt desc; sort=valor usa amount", async () => {
    const repo = new MockCommissionRepository();
    seed(repo);

    const padrao = await repo.list("shop-1", { page: 1, limit: 20 });
    expect(padrao.data.map((e) => e.id)).toEqual(["c2", "c1"]);

    const porValor = await repo.list("shop-1", {
      page: 1,
      limit: 20,
      sort: { field: "valor", dir: "asc" },
    });
    expect(porValor.data.map((e) => e.id)).toEqual(["c1", "c2"]);
  });

  it("total é do conjunto filtrado; a página só recorta os dados", async () => {
    const repo = new MockCommissionRepository();
    seed(repo);

    const page2 = await repo.list("shop-1", { page: 2, limit: 1 });
    expect(page2.total).toBe(2);
    expect(page2.data.map((e) => e.id)).toEqual(["c1"]);
  });
});

describe("modules/commissions — MockCommissionRepository.summary", () => {
  it("soma sobre todo o conjunto filtrado, sem paginação", async () => {
    const repo = new MockCommissionRepository();
    seed(repo);

    const summary = await repo.summary("shop-1", {});
    expect(summary.commissionTotal).toBe(50);
    expect(summary.grossTotal).toBe(150);
    expect(summary.byProfessional).toEqual([
      { professionalId: "pro-1", professionalName: "Profissional", commissionTotal: 20, entryCount: 1 },
      { professionalId: "pro-2", professionalName: "Profissional", commissionTotal: 30, entryCount: 1 },
    ]);
  });

  it("respeita o mesmo filtro de período da listagem", async () => {
    const repo = new MockCommissionRepository();
    seed(repo);

    const summary = await repo.summary("shop-1", {
      from: "2026-10-06",
      to: "2026-10-06",
      timeZone: SP,
    });
    expect(summary.commissionTotal).toBe(30);
    expect(summary.grossTotal).toBe(100);
  });
});

describe("modules/commissions — MockCommissionRepository.createForQueueItem", () => {
  it("cria um lançamento por split e marca a origem como fila", async () => {
    const repo = new MockCommissionRepository();

    await repo.createForQueueItem({
      barbershopId: "shop-1",
      queueItemId: "q1",
      serviceId: "svc-1",
      finalPrice: 100,
      splits: [
        { professionalId: "pro-1", percentage: 40 },
        { professionalId: "pro-2", percentage: 20 },
      ],
    });

    expect(await repo.hasEntriesForQueueItem("q1")).toBe(true);
    const result = await repo.list("shop-1", { page: 1, limit: 20 });
    expect(result.total).toBe(2);
    expect(result.data.every((e) => e.origin === "QUEUE")).toBe(true);
    expect(result.data.map((e) => e.amount).sort((a, b) => a - b)).toEqual([20, 40]);
  });
});
