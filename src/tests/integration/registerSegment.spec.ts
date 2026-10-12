/// <reference types="vitest/globals" />
/**
 * Cadastro com segmento, contra Postgres real.
 *
 * O que só um teste real pega: o `businessSegment` precisa sobreviver ao
 * `$transaction` do RegisterUseCase, o `targetAudience` precisa ser normalizado
 * no backend (PETSHOP zera; barbearia sem escolha cai em MASCULINO) e o seed de
 * catálogo precisa puxar o serviço do segmento, não o de barbearia.
 *
 * Antes deste fluxo, um petshop cadastrado nasceria com "Cortes" e "Barba".
 *
 * Só o validador de e-mail é mockado — ele faz lookup MX real e o teste não pode
 * depender de rede. Prisma, hash, sessão e seed rodam de verdade.
 *
 * Requer Postgres local (docker-compose, porta 5442) via `.env`.
 */
import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { prisma } from "@/libs/prismaClient";
import { RegisterUseCase } from "@/modules/auth/useCases/register/RegisterUseCase";
import { SEGMENT_CONFIGS } from "@/shared/segments";

vi.mock("@/shared/services/emailValidationService", () => ({
  validateEmail: vi.fn(async () => ({ valid: true })),
}));

const SUFFIX = randomUUID().slice(0, 8);

/** CPF é único por usuário — cada cadastro precisa de um válido e distinto. */
function validCpf(seed: number): string {
  const base = String(100000000 + (seed % 899999999)).padStart(9, "0");
  const digit = (slice: string, factor: number) => {
    const sum = [...slice].reduce((acc, d, i) => acc + Number(d) * (factor - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = digit(base, 10);
  const d2 = digit(base + d1, 11);
  return base + d1 + d2;
}

let seq = 0;

const useCase = new RegisterUseCase({
  hash: async (v: string) => `hashed:${v}`,
  compare: async () => true,
} as never);

async function register(segment?: string, targetAudience?: string | null) {
  return useCase.execute({
    ownerName: `Dono ${segment ?? "sem-seg"}`,
    email: `${(segment ?? "sem").toLowerCase()}-${SUFFIX}-${++seq}@exemplo.com`,
    password: "segredo123",
    cpf: validCpf(seq * 7919 + Date.now() % 100000),
    barbershopName: `Salao ${segment ?? "sem"} ${SUFFIX}`,
    whatsapp: "11999998888",
    termsVersion: "1.0",
    termsAccepted: true,
    marketingOptIn: false,
    lgpdConsent: true,
    ...(segment ? { businessSegment: segment as never } : {}),
    ...(targetAudience !== undefined ? { targetAudience: targetAudience as never } : {}),
  });
}

describe("cadastro com segmento (Postgres real)", () => {
  const createdBarbershopIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    const shops = { in: createdBarbershopIds.filter(Boolean) };
    await prisma.user.deleteMany({ where: { barbershopId: shops } });
    await prisma.barbershop.deleteMany({ where: { id: shops } });
  });

  it.each([
    ["BARBERSHOP", "MASCULINO"],
    ["HAIR_SALON", "UNISSEX"],
    ["NAIL_STUDIO", "FEMININO"],
  ])(
    "%s grava o segmento, aplica o público sugerido e semeia o catálogo",
    async (segment, expectedAudience) => {
      const result = await register(segment);
      createdBarbershopIds.push(result.user.barbershopId!);
      createdUserIds.push(result.user.id);

      const shop = await prisma.barbershop.findUniqueOrThrow({
        where: { id: result.user.barbershopId! },
      });

      expect(shop.businessSegment).toBe(segment);
      expect(shop.targetAudience).toBe(expectedAudience);
      expect(shop.operationMode).toBe(
        SEGMENT_CONFIGS[segment as keyof typeof SEGMENT_CONFIGS].suggestedOperationMode
      );

      const services = await prisma.service.findMany({
        where: { barbershopId: shop.id },
        select: { name: true },
      });
      const names = services.map((s) => s.name);
      const expected = SEGMENT_CONFIGS[segment as keyof typeof SEGMENT_CONFIGS].catalog.services.map(
        (s) => s.name
      );
      expect(names.sort()).toEqual([...expected].sort());
      expect(names.length).toBeGreaterThan(0);
    }
  );

  it("PETSHOP não recebe público e o catálogo não tem 'Barba'", async () => {
    const result = await register("PETSHOP");
    createdBarbershopIds.push(result.user.barbershopId!);

    const shop = await prisma.barbershop.findUniqueOrThrow({
      where: { id: result.user.barbershopId! },
    });
    expect(shop.businessSegment).toBe("PETSHOP");
    expect(shop.targetAudience).toBeNull();

    const names = (
      await prisma.service.findMany({ where: { barbershopId: shop.id }, select: { name: true } })
    ).map((s) => s.name);
    expect(names).not.toContain("Barba");
    expect(names).not.toContain("Cortes");
    expect(names.length).toBeGreaterThan(0);
  });

  it("público explícito do usuário é respeitado nos segmentos de beleza", async () => {
    const result = await register("HAIR_SALON", "FEMININO");
    createdBarbershopIds.push(result.user.barbershopId!);

    const shop = await prisma.barbershop.findUniqueOrThrow({
      where: { id: result.user.barbershopId! },
    });
    expect(shop.targetAudience).toBe("FEMININO");
  });

  it("sem segmento nasce BARBERSHOP com público sugerido — comportamento de antes", async () => {
    const result = await register();
    createdBarbershopIds.push(result.user.barbershopId!);

    const shop = await prisma.barbershop.findUniqueOrThrow({
      where: { id: result.user.barbershopId! },
    });
    expect(shop.businessSegment).toBe("BARBERSHOP");
    expect(shop.targetAudience).toBe("MASCULINO");

    // O operationMode não é aplicado quando o segmento veio omisso: fica no
    // default HYBRID do banco, exatamente como antes desta feature.
    expect(shop.operationMode).toBe("HYBRID");
  });

  it("a coluna businessSegment existe e aceita os valores do enum (backfill aplicado)", async () => {
    // O backfill converte OTHER -> BARBERSHAP. Se a migration não tivesse
    // rodado, essa consulta falharia com invalid input for enum.
    const counts = await prisma.barbershop.groupBy({
      by: ["businessSegment"],
      _count: { _all: true },
    });
    const valid = new Set(Object.keys(SEGMENT_CONFIGS));
    for (const row of counts) {
      expect(valid.has(row.businessSegment as string), `valor inválido: ${row.businessSegment}`).toBe(
        true
      );
    }
  });
});
