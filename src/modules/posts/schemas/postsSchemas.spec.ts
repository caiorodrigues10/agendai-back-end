/// <reference types="vitest/globals" />
import { previewPostQuerySchema, createPostSchema, updatePostSchema, priceSplitSchema } from "./postsSchemas";

const BARBERSHOP_ID = "00000000-0000-0000-0000-000000000001";

describe("priceSplitSchema — contrato items[] (máx. 8)", () => {
  it("aceita até 8 serviços com preço número ou string", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ name: `Serviço ${i + 1}`, price: i % 2 ? `${i + 1},50` : i + 1 }));
    const parsed = priceSplitSchema.parse({ items, businessName: "Barber Test" });
    expect(parsed.items).toHaveLength(8);
    expect(parsed.items[1].price).toBe("2,50");
  });

  it("rejeita 9 serviços (limite do modelo)", () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ name: `Serviço ${i + 1}`, price: 10 }));
    expect(() => priceSplitSchema.parse({ items })).toThrow();
  });

  it("lista vazia é válida na schema (o controller decide placeholder x 400)", () => {
    expect(priceSplitSchema.parse({ items: [] }).items).toEqual([]);
  });
});

describe("previewPostQuerySchema — priceSplit na query GET", () => {
  it("deserializa o priceSplit enviado como string JSON", () => {
    const query = previewPostQuerySchema.parse({
      barbershopId: BARBERSHOP_ID,
      templateKey: "price-split",
      priceSplit: JSON.stringify({ items: [{ name: "Corte", price: 45 }] }),
    });
    expect(query.priceSplit?.items).toEqual([{ name: "Corte", price: 45 }]);
  });

  it("JSON inválido não derruba a prévia (vira undefined)", () => {
    const query = previewPostQuerySchema.parse({
      barbershopId: BARBERSHOP_ID,
      templateKey: "price-split",
      priceSplit: "{quebrado",
    });
    expect(query.priceSplit).toBeUndefined();
  });
});

describe("createPostSchema / updatePostSchema — priceSplit opcional", () => {
  it("create aceita priceSplit completo", () => {
    const body = createPostSchema.parse({
      barbershopId: BARBERSHOP_ID,
      type: "announcement",
      templateKey: "price-split",
      priceSplit: { items: [{ name: "Corte", price: 45 }], businessName: "Barber Test", whatsapp: "11999999999" },
    });
    expect(body.priceSplit?.items).toHaveLength(1);
  });

  it("update aceita priceSplit sem tocar nos demais campos", () => {
    const body = updatePostSchema.parse({ priceSplit: { items: [{ name: "Barba", price: null }] } });
    expect(body.priceSplit?.items[0].name).toBe("Barba");
    expect(body.title).toBeUndefined();
  });
});
