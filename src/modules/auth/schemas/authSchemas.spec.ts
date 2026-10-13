/// <reference types="vitest/globals" />
/**
 * Validação de segmento/público na API de cadastro.
 *
 * A regra de negócio: o frontend exige o segmento, mas a API o aceita opcional
 * (clientes antigos não enviam → BARBERSHAP default). Público só existe em
 * segmentos de beleza — em PETSHOP é erro explícito, não algo a ignorar em
 * silêncio, para que o front não consiga gravar estado incoerente por engano.
 *
 * O schema do Google reaplica o mesmo refinamento porque `.omit()`/`.extend()`
 * do Zod descartam refinamentos do schema base — era por ali que o erro passaria.
 */
import { registerSchema, registerWithGoogleSchema } from "./authSchemas";

const VALID_CPF = "11144477735";

const base = {
  ownerName: "Dona de Salão",
  email: "dona@exemplo.com",
  password: "segredo123",
  cpf: VALID_CPF,
  barbershopName: "Barbearia Central",
  whatsapp: "11999998888",
  termsVersion: "1.0",
  termsAccepted: true,
  marketingOptIn: false,
  lgpdConsent: true,
};

const googleBase = {
  idToken: "token-google-suficientemente-longo",
  ownerName: "Dona de Salão",
  cpf: VALID_CPF,
  barbershopName: "Barbearia Central",
  whatsapp: "11999998888",
  termsVersion: "1.0",
  termsAccepted: true,
  marketingOptIn: false,
  lgpdConsent: true,
};

function paths(error: unknown): string[] {
  return (error as { issues: Array<{ path: Array<string | number>; code: string }> })
    .issues.map((i) => `${i.path.join(".")}:${i.code}`);
}

describe("registerSchema — segmento e público", () => {
  it("aceita os 4 segmentos do catálogo", () => {
    for (const businessSegment of [
      "BARBERSHOP",
      "HAIR_SALON",
      "NAIL_STUDIO",
      "PETSHOP",
    ] as const) {
      const parsed = registerSchema.safeParse({ ...base, businessSegment });
      expect(parsed.success, `segmento ${businessSegment} recusado`).toBe(true);
    }
  });

  it("aceita TODOS os valores do enum (incluindo os ampliados de 2026-10)", () => {
    const allSegments = [
      "BARBERSHOP",
      "HAIR_SALON",
      "BEAUTY_STUDIO",
      "NAIL_STUDIO",
      "LASH_BROW_STUDIO",
      "AESTHETICS",
      "SPA",
      "PETSHOP",
      "MAKEUP_STUDIO",
      "PHYSIOTHERAPY",
      "NUTRITION",
      "PSYCHOTHERAPY",
      "VETERINARY",
      "CAR_WASH",
      "AUTO_REPAIR",
      "PHOTO_STUDIO",
      "TATTOO_PIERCING",
      "COACHING",
      "PRIVATE_CLASSES",
      "TECH_SUPPORT",
      "HOME_SERVICES",
      "OTHER",
    ] as const;
    for (const businessSegment of allSegments) {
      const parsed = registerSchema.safeParse({ ...base, businessSegment });
      expect(parsed.success, `segmento ${businessSegment} recusado`).toBe(true);
    }
  });

  it("aceita sem segmento (compat) e mantém o default BARBERSHOP do banco", () => {
    const parsed = registerSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    // O default é do schema Prisma, não do zod — aqui só confirmamos que ometer
    // não é erro. Quem grava o default é o RegisterUseCase.
    expect(parsed.success && parsed.data.businessSegment).toBeUndefined();
  });

  it("recusa segmento desconhecido (ex.: 'SALAO_DE_UNHAS' do formulário antigo)", () => {
    const parsed = registerSchema.safeParse({ ...base, businessSegment: "BARBEARIA" });
    expect(parsed.success).toBe(false);
    expect(paths(parsed.error)).toContain("businessSegment:invalid_enum_value");
  });

  it("aceita público nos segmentos de beleza", () => {
    for (const businessSegment of ["BARBERSHOP", "HAIR_SALON"] as const) {
      for (const targetAudience of ["MASCULINO", "FEMININO", "UNISSEX"] as const) {
        const parsed = registerSchema.safeParse({ ...base, businessSegment, targetAudience });
        expect(parsed.success, `${businessSegment}/${targetAudience}`).toBe(true);
      }
    }
  });

  it("recusa público em PETSHOP", () => {
    const parsed = registerSchema.safeParse({
      ...base,
      businessSegment: "PETSHOP",
      targetAudience: "FEMININO",
    });
    expect(parsed.success).toBe(false);
    expect(paths(parsed.error)).toContain("targetAudience:custom");
  });

  it("aceita PETSHOP sem público", () => {
    const parsed = registerSchema.safeParse({ ...base, businessSegment: "PETSHOP" });
    expect(parsed.success).toBe(true);
  });

  it("aceita público nulo explícito (front enviando vazio)", () => {
    const parsed = registerSchema.safeParse({
      ...base,
      businessSegment: "PETSHOP",
      targetAudience: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("recusa público desconhecido", () => {
    const parsed = registerSchema.safeParse({
      ...base,
      businessSegment: "BARBERSHOP",
      targetAudience: "TODOS",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("registerSchema — texto livre de OTHER", () => {
  it("aceita OTHER com texto até 80 caracteres", () => {
    const parsed = registerSchema.safeParse({
      ...base,
      businessSegment: "OTHER",
      businessSegmentOther: "Estúdio de fotografia de produtos",
    });
    expect(parsed.success).toBe(true);
  });

  it("aceita OTHER sem texto (campo opcional)", () => {
    expect(registerSchema.safeParse({ ...base, businessSegment: "OTHER" }).success).toBe(true);
  });

  it("recusa texto com mais de 80 caracteres", () => {
    const parsed = registerSchema.safeParse({
      ...base,
      businessSegment: "OTHER",
      businessSegmentOther: "x".repeat(81),
    });
    expect(parsed.success).toBe(false);
    expect(paths(parsed.error)).toContain("businessSegmentOther:custom");
  });

  it("ignora o texto quando o segmento não é OTHER (não grava fora de OTHER)", () => {
    // O schema aceita (compat com clientes antigos); quem zera é o
    // normalizeSegmentOther no use case — aqui só garantimos que não é erro.
    const parsed = registerSchema.safeParse({
      ...base,
      businessSegment: "HAIR_SALON",
      businessSegmentOther: "Texto órfão",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("registerWithGoogleSchema — segmento e público", () => {
  it("aplica o mesmo refinamento (o .omit() do zod descarta o do schema base)", () => {
    const ok = registerWithGoogleSchema.safeParse({
      ...googleBase,
      businessSegment: "BARBERSHOP",
      targetAudience: "MASCULINO",
    });
    expect(ok.success).toBe(true);

    const petshop = registerWithGoogleSchema.safeParse({
      ...googleBase,
      businessSegment: "PETSHOP",
      targetAudience: "FEMININO",
    });
    expect(petshop.success).toBe(false);
    expect(paths(petshop.error)).toContain("targetAudience:custom");
  });

  it("descarta email/password herdados do schema base", () => {
    expect(registerWithGoogleSchema.safeParse(googleBase).success).toBe(true);
  });
});
