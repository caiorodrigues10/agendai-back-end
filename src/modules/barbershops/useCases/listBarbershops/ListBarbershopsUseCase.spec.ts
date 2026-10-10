/// <reference types="vitest/globals" />

import { ListBarbershopsUseCase } from "./ListBarbershopsUseCase";
import type { IBarbershopRepository } from "../../repositories/IBarbershopRepository";

const LOJA_A = { id: "shop-a", name: "Barbearia A" };
const LOJA_B = { id: "shop-b", name: "Barbearia B" };
const LOJA_C = { id: "shop-c", name: "Barbearia C" };

function makeUseCase(items: unknown[] = [LOJA_A, LOJA_B, LOJA_C]) {
  const repo = { list: vi.fn().mockResolvedValue(items) } as unknown as IBarbershopRepository;
  return { useCase: new ListBarbershopsUseCase(repo), repo };
}

describe("ListBarbershopsUseCase — paginação (M7: ?limit era ignorado)", () => {
  it("respeita limit na listagem pública", async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute({ limit: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(LOJA_A);
  });

  it("respeita offset junto com limit", async () => {
    const { useCase } = makeUseCase();

    const result = await useCase.execute({ limit: 1, offset: 2 });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(LOJA_C);
  });

  it("sem params mantém o contrato atual (lista completa)", async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.execute()).resolves.toHaveLength(3);
  });

  it("offset alem do fim devolve lista vazia", async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.execute({ offset: 10 })).resolves.toEqual([]);
  });
});
