import { describe, expect, it } from "vitest";
import { inventoryCommands } from "./inventoryCommands";

const SHOP = "11111111-1111-4111-8111-111111111111";

type ItemBot = {
  id: string;
  name: string;
  salePrice: number;
  stockQty: number;
  minStock: number;
  trackStock: boolean;
  active: boolean;
};

function ctxCom(itens: ItemBot[]) {
  return {
    actor: { barbershopId: SHOP },
    actions: { listProducts: async () => itens },
  } as never;
}

function comandoEstoque() {
  const comando = inventoryCommands.find((c) => c.id === "stock.list");
  if (!comando) throw new Error("comando stock.list não encontrado");
  return comando;
}

describe('comando "estoque" do assistente do dono', () => {
  it("anuncia 'estoque baixo!' para produto que está na definição", async () => {
    const resultado = await comandoEstoque().run(
      ctxCom([
        {
          id: "p1",
          name: "Shampoo Hidratante",
          salePrice: 39.9,
          stockQty: 2,
          minStock: 5,
          trackStock: true,
          active: true,
        },
      ]),
      { raw: "estoque", subject: "Shampoo Hidratante" } as never,
    );

    expect(resultado.text).toContain("Shampoo Hidratante: 2 em estoque");
    expect(resultado.text).toContain("— estoque baixo!");
  });

  it("não anuncia 'estoque baixo!' para produto que não controla estoque", async () => {
    const resultado = await comandoEstoque().run(
      ctxCom([
        {
          id: "p2",
          name: "Brinde Promocional",
          salePrice: 0,
          stockQty: 2,
          minStock: 5,
          trackStock: false,
          active: true,
        },
      ]),
      { raw: "estoque", subject: "Brinde Promocional" } as never,
    );

    expect(resultado.text).toContain("Brinde Promocional: 2 em estoque");
    expect(resultado.text).not.toContain("— estoque baixo!");
  });

  it("não anuncia 'estoque baixo!' para zerado com mínimo 0", async () => {
    const resultado = await comandoEstoque().run(
      ctxCom([
        {
          id: "p3",
          name: "Barbatimão Zerado",
          salePrice: 19.9,
          stockQty: 0,
          minStock: 0,
          trackStock: true,
          active: true,
        },
      ]),
      { raw: "estoque", subject: "Barbatimão Zerado" } as never,
    );

    expect(resultado.text).toContain("Barbatimão Zerado: 0 em estoque");
    expect(resultado.text).not.toContain("— estoque baixo!");
  });
});

describe('comando "estoque baixo" do assistente do dono', () => {
  function comandoEstoqueBaixo() {
    const comando = inventoryCommands.find((c) => c.id === "stock.low");
    if (!comando) throw new Error("comando stock.low não encontrado");
    return comando;
  }

  it("lista os itens para repor com estoque e mínimo reais", async () => {
    const resultado = await comandoEstoqueBaixo().run(
      {
        actor: { barbershopId: SHOP },
        actions: {
          lowStockProducts: async () => [
            { id: "p1", name: "Shampoo Hidratante", stockQty: 2, minStock: 5 },
          ],
        },
      } as never,
      { raw: "estoque baixo" } as never,
    );

    expect(resultado.text).toContain("Itens para repor:");
    expect(resultado.text).toContain("1. Shampoo Hidratante — 2 un. (mínimo 5)");
  });

  it("avisa quando não há item em estoque baixo", async () => {
    const resultado = await comandoEstoqueBaixo().run(
      {
        actor: { barbershopId: SHOP },
        actions: { lowStockProducts: async () => [] },
      } as never,
      { raw: "estoque baixo" } as never,
    );

    expect(resultado.text).toContain("Nenhum item com estoque baixo");
  });
});
