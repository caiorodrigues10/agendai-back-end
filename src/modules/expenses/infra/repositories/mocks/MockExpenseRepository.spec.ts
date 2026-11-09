import { describe, expect, it } from "vitest";
import { MockExpenseRepository } from "./MockExpenseRepository";
import type { IExpenseResponseDTO } from "@/modules/expenses/dtos/IExpenseDTO";

const agora = new Date("2026-10-10T12:00:00.000Z");

const despesa = (
  partial: Partial<IExpenseResponseDTO> & Pick<IExpenseResponseDTO, "id">
): IExpenseResponseDTO => ({
  barbershopId: "shop-1",
  categoryId: null,
  categoryName: null,
  title: "Despesa",
  description: null,
  amount: 100,
  type: "VARIABLE",
  recurrence: "ONCE",
  referenceDate: new Date("2026-10-05T12:00:00.000Z"),
  paidAt: null,
  dueDate: null,
  paymentMethod: null,
  supplierName: null,
  receiptUrl: null,
  notes: null,
  createdById: "user-1",
  updatedById: null,
  createdAt: new Date("2026-10-05T12:00:00.000Z"),
  updatedAt: new Date("2026-10-05T12:00:00.000Z"),
  ...partial,
});

describe("modules/expenses — MockExpenseRepository.list", () => {
  it("filtra apenas o salão do contexto", async () => {
    const repo = new MockExpenseRepository();
    repo.expenses = [
      despesa({ id: "e1", barbershopId: "shop-1" }),
      despesa({ id: "e2", barbershopId: "shop-2" }),
    ];

    const result = await repo.list({ page: 1, limit: 20, barbershopId: "shop-1" });
    expect(result.data.map((e) => e.id)).toEqual(["e1"]);
    expect(result.total).toBe(1);
  });

  it("payment=pending devolve as não pagas (inclusive vencidas)", async () => {
    const repo = new MockExpenseRepository();
    repo.expenses = [
      despesa({ id: "paga", paidAt: new Date("2026-10-01T10:00:00.000Z") }),
      despesa({ id: "pendente", dueDate: new Date("2026-10-20T00:00:00.000Z") }),
      despesa({
        id: "vencida",
        dueDate: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ];

    const result = await repo.list({
      page: 1,
      limit: 20,
      barbershopId: "shop-1",
      payment: ["pending"],
    });
    expect(result.data.map((e) => e.id).sort()).toEqual(["pendente", "vencida"]);
  });

  it("payment=overdue não devolve despesa paga", async () => {
    const repo = new MockExpenseRepository();
    repo.expenses = [
      despesa({
        id: "paga-e-vencida",
        paidAt: new Date("2020-10-02T10:00:00.000Z"),
        dueDate: new Date("2020-10-01T00:00:00.000Z"),
      }),
      despesa({
        id: "nao-paga-vencida",
        dueDate: new Date("2020-10-01T00:00:00.000Z"),
      }),
      despesa({
        id: "vence-futuro",
        dueDate: new Date("2099-10-11T00:00:00.000Z"),
      }),
    ];

    const result = await repo.list({
      page: 1,
      limit: 20,
      barbershopId: "shop-1",
      payment: ["overdue"],
    });
    expect(result.data.map((e) => e.id)).toEqual(["nao-paga-vencida"]);
  });

  it("período por referenceDate inclui o último dia inteiro", async () => {
    const repo = new MockExpenseRepository();
    repo.expenses = [
      despesa({
        id: "inicio",
        referenceDate: new Date("2026-10-05T12:00:00.000Z"),
      }),
      despesa({
        id: "ultimo-dia",
        referenceDate: new Date("2026-10-08T02:00:00.000Z"),
      }),
      despesa({
        id: "fora",
        referenceDate: new Date("2026-10-08T12:00:00.000Z"),
      }),
    ];

    const result = await repo.list({
      page: 1,
      limit: 20,
      barbershopId: "shop-1",
      from: "2026-10-05",
      to: "2026-10-07",
    });
    expect(result.data.map((e) => e.id).sort()).toEqual(["inicio", "ultimo-dia"]);
  });

  it("busca por título, fornecedor e observações", async () => {
    const repo = new MockExpenseRepository();
    repo.expenses = [
      despesa({ id: "e1", title: "Aluguel da loja" }),
      despesa({ id: "e2", supplierName: "Distribuidora Aluguel" }),
      despesa({ id: "e3", notes: "conta de aluguel" }),
      despesa({ id: "e4", title: " shampoo" }),
    ];

    const result = await repo.list({
      page: 1,
      limit: 20,
      barbershopId: "shop-1",
      search: "Aluguel",
    });
    expect(result.data.map((e) => e.id).sort()).toEqual(["e1", "e2", "e3"]);
  });

  it("sort por dueDate deixa as sem vencimento por último (nas duas direções)", async () => {
    const repo = new MockExpenseRepository();
    repo.expenses = [
      despensaComPrazo("com-prazo", new Date("2026-10-20T00:00:00.000Z")),
      despensaSemPrazo("sem-prazo"),
      despensaComPrazo("com-prazo-2", new Date("2026-10-15T00:00:00.000Z")),
    ];

    const asc = await repo.list({
      page: 1,
      limit: 20,
      barbershopId: "shop-1",
      sort: { field: "dueDate", dir: "asc" },
    });
    expect(asc.data.map((e) => e.id)).toEqual([
      "com-prazo-2",
      "com-prazo",
      "sem-prazo",
    ]);

    const desc = await repo.list({
      page: 1,
      limit: 20,
      barbershopId: "shop-1",
      sort: { field: "dueDate", dir: "desc" },
    });
    expect(desc.data.map((e) => e.id)).toEqual([
      "com-prazo",
      "com-prazo-2",
      "sem-prazo",
    ]);
  });

  it("sem sort mantém referenceDate desc", async () => {
    const repo = new MockExpenseRepository();
    repo.expenses = [
      despesa({
        id: "antiga",
        referenceDate: new Date("2026-09-01T00:00:00.000Z"),
      }),
      despesa({
        id: "recente",
        referenceDate: new Date("2026-10-05T12:00:00.000Z"),
      }),
    ];

    const result = await repo.list({ page: 1, limit: 20, barbershopId: "shop-1" });
    expect(result.data.map((e) => e.id)).toEqual(["recente", "antiga"]);
  });
});

function despensaComPrazo(id: string, dueDate: Date): IExpenseResponseDTO {
  return despesa({ id, dueDate });
}

function despensaSemPrazo(id: string): IExpenseResponseDTO {
  return despesa({ id, dueDate: null });
}
