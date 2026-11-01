import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ListWhatsAppInstancesUseCase } from "./ListWhatsAppInstancesUseCase";
import { whatsappPaginationQuerySchema } from "../../schemas/adminWhatsAppSchemas";
import type { EvolutionConnectionState } from "@/shared/services/evolutionApiService";

const ORIGINAL_ENV = { ...process.env };

function instanceRepo(shops: Array<{ id: string; name: string; evolutionInstanceName: string | null }>, total = shops.length) {
  return {
    findShop: vi.fn(),
    listShops: vi.fn().mockResolvedValue({ shops, total }),
  };
}

describe("ListWhatsAppInstancesUseCase", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    process.env.EVOLUTION_AI_INSTANCE_NAME = "ai-instance";
    process.env.EVOLUTION_INSTANCE_NAME = "platform-instance";
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  it("pagina salões e mantém IA e plataforma fora da contagem", async () => {
    const repo = instanceRepo([{ id: "shop-1", name: "Salão 1", evolutionInstanceName: "shop-1" }], 42);
    const useCase = new ListWhatsAppInstancesUseCase(repo as never, async () => "open");

    const result = await useCase.execute({ page: 2, limit: 20 });

    expect(result.meta).toEqual({ total: 42, page: 2, limit: 20, totalPages: 3 });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ kind: "shop", shopId: "shop-1", state: "open" });
    expect(repo.listShops).toHaveBeenCalledWith({ page: 2, limit: 20 });
  });

  it("mostra IA e plataforma apenas na primeira página", async () => {
    const repo = instanceRepo([{ id: "shop-1", name: "Salão 1", evolutionInstanceName: "shop-1" }]);
    const useCase = new ListWhatsAppInstancesUseCase(repo as never, async () => "open");

    const first = await useCase.execute({ page: 1, limit: 20 });
    expect(first.data.map((item) => item.kind)).toEqual(["ai", "platform", "shop"]);

    const second = await useCase.execute({ page: 2, limit: 20 });
    expect(second.data.map((item) => item.kind)).toEqual(["shop"]);
  });

  it("marca unreachable quando a Evolution falha, sem derrubar as demais", async () => {
    const repo = instanceRepo([
      { id: "shop-1", name: "Salão 1", evolutionInstanceName: "shop-1" },
      { id: "shop-2", name: "Salão 2", evolutionInstanceName: "shop-2" },
    ]);
    const fetchState = vi.fn(async (name: string): Promise<EvolutionConnectionState> => {
      if (name === "shop-1") throw new Error("ECONNREFUSED 10.0.0.5:8080 apikey=secret");
      return "open";
    });

    const useCase = new ListWhatsAppInstancesUseCase(repo as never, fetchState);
    const result = await useCase.execute({ page: 1, limit: 20 });

    const shop1 = result.data.find((item) => item.shopId === "shop-1");
    const shop2 = result.data.find((item) => item.shopId === "shop-2");
    expect(shop1?.state).toBe("unreachable");
    expect(shop1?.error).toBe("Evolution indisponível");
    expect(shop1?.error).not.toContain("secret");
    expect(shop2?.state).toBe("open");
  });

  it("marca unreachable quando a chamada estoura o timeout", async () => {
    const repo = instanceRepo([{ id: "shop-1", name: "Salão 1", evolutionInstanceName: "shop-1" }]);
    const fetchState = vi.fn(
      (): Promise<EvolutionConnectionState> => new Promise(() => undefined)
    );

    const useCase = new ListWhatsAppInstancesUseCase(repo as never, fetchState);
    const promise = useCase.execute({ page: 1, limit: 20 });
    await vi.advanceTimersByTimeAsync(3_100);
    const result = await promise;

    const shop1 = result.data.find((item) => item.shopId === "shop-1");
    expect(shop1?.state).toBe("unreachable");
    expect(shop1?.error).toBe("Evolution não respondeu a tempo");
  });

  it("não consulta mais de 5 instâncias ao mesmo tempo", async () => {
    const shops = Array.from({ length: 12 }, (_value, index) => ({
      id: `shop-${index}`,
      name: `Salão ${index}`,
      evolutionInstanceName: `shop-${index}`,
    }));
    const repo = instanceRepo(shops);

    let active = 0;
    let maxActive = 0;
    const fetchState = vi.fn(async (): Promise<EvolutionConnectionState> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return "open";
    });

    const useCase = new ListWhatsAppInstancesUseCase(repo as never, fetchState);
    await useCase.execute({ page: 1, limit: 20 });

    expect(maxActive).toBeLessThanOrEqual(5);
    expect(fetchState).toHaveBeenCalledTimes(14);
  });
});

describe("whatsappPaginationQuerySchema", () => {
  it("coage números e limita o tamanho da página", () => {
    expect(whatsappPaginationQuerySchema.parse({ page: "2", limit: "50" })).toEqual({
      page: 2,
      limit: 50,
    });
    expect(whatsappPaginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(() => whatsappPaginationQuerySchema.parse({ limit: "51" })).toThrow();
    expect(() => whatsappPaginationQuerySchema.parse({ page: "0" })).toThrow();
  });
});
