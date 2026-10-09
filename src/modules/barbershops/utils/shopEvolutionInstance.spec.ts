/// <reference types="vitest/globals" />
import { toPublicBarbershop } from "./shopEvolutionInstance";

const shop = {
  id: "1ac5be50-6ce7-464e-bc38-ab18cf24aeab",
  name: "Barbearia X",
  whatsapp: "5511999990000",
  address: "Rua A, 10",
  city: "São Paulo",
  logoUrl: "https://cdn/logo.png",
  operationMode: "HYBRID",
  cnpj: "12345678000199",
  evolutionInstanceName: "shop-1ac5be50",
};

describe("toPublicBarbershop (resposta pública de GET /barbershops)", () => {
  it("remove o nome da instância Evolution", () => {
    const out = toPublicBarbershop(shop);
    expect(out).not.toHaveProperty("evolutionInstanceName");
  });

  it("remove o cnpj — dado sensível em rota sem autenticação", () => {
    const out = toPublicBarbershop(shop);
    expect(out).not.toHaveProperty("cnpj");
    expect("cnpj" in out).toBe(false);
  });

  it("mantém os campos públicos usados pela agenda", () => {
    const out = toPublicBarbershop(shop);
    expect(out).toMatchObject({
      id: shop.id,
      name: shop.name,
      whatsapp: shop.whatsapp,
      address: shop.address,
      city: shop.city,
      logoUrl: shop.logoUrl,
      operationMode: shop.operationMode,
    });
  });
});
