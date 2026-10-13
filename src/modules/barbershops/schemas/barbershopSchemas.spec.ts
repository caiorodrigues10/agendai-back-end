import { describe, expect, it } from "vitest";
import { createBarbershopSchema, updateBarbershopSchema } from "./barbershopSchemas";

const base = { name: "Salão", whatsapp: "11999998888" };

describe("updateBarbershopSchema — segmento e público", () => {
  it("aceita trocar o segmento sem público (o backend aplica o sugerido)", () => {
    const parsed = updateBarbershopSchema.parse({ businessSegment: "HAIR_SALON" });
    expect(parsed.businessSegment).toBe("HAIR_SALON");
  });

  it("aceita PETSHOP sem público", () => {
    const parsed = updateBarbershopSchema.parse({ businessSegment: "PETSHOP" });
    expect(parsed.businessSegment).toBe("PETSHOP");
  });

  it("recusa PETSHOP com público — o erro não pode passar em silêncio", () => {
    const result = updateBarbershopSchema.safeParse({
      businessSegment: "PETSHOP",
      targetAudience: "MASCULINO",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["targetAudience"]);
      expect(result.error.issues[0].message).toContain("não se aplica");
    }
  });

  it("recusa segmento fora do enum (nunca confiar no front)", () => {
    expect(updateBarbershopSchema.safeParse({ businessSegment: "PETSHOPPING" }).success).toBe(false);
  });

  it("aceita público válido em segmento de beleza", () => {
    const parsed = updateBarbershopSchema.parse({
      businessSegment: "NAIL_STUDIO",
      targetAudience: "UNISSEX",
    });
    expect(parsed.targetAudience).toBe("UNISSEX");
  });
});

describe("createBarbershopSchema — segmento e público", () => {
  it("aceita PETSHOP sem público", () => {
    const parsed = createBarbershopSchema.parse({ ...base, businessSegment: "PETSHOP" });
    expect(parsed.businessSegment).toBe("PETSHOP");
  });

  it("recusa PETSHOP com público", () => {
    const result = createBarbershopSchema.safeParse({
      ...base,
      businessSegment: "PETSHOP",
      targetAudience: "FEMININO",
    });
    expect(result.success).toBe(false);
  });

  it("sem segmento continua aceitando (compat com clientes antigos)", () => {
    const parsed = createBarbershopSchema.parse(base);
    expect(parsed.businessSegment).toBeUndefined();
  });
});

describe("texto livre de OTHER (businessSegmentOther)", () => {
  it("aceita OTHER com texto até 80 caracteres", () => {
    const parsed = updateBarbershopSchema.parse({
      businessSegment: "OTHER",
      businessSegmentOther: "Academia de boxe com aulas",
    });
    expect(parsed.businessSegmentOther).toBe("Academia de boxe com aulas");
  });

  it("recusa texto com mais de 80 caracteres", () => {
    const result = updateBarbershopSchema.safeParse({
      businessSegment: "OTHER",
      businessSegmentOther: "x".repeat(81),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["businessSegmentOther"]);
    }
  });

  it("createBarbershopSchema aplica a mesma regra", () => {
    const result = createBarbershopSchema.safeParse({
      ...base,
      businessSegment: "OTHER",
      businessSegmentOther: "y".repeat(81),
    });
    expect(result.success).toBe(false);
  });
});
