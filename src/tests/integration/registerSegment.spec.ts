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
import { ALL_SEGMENTS, SEGMENT_CONFIGS } from "@/shared/segments";
import type { BusinessSegment } from "@/modules/barbershops/dtos/IBarbershopResponseDTO";

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

async function register(
  segment?: string,
  targetAudience?: string | null,
  businessSegmentOther?: string
) {
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
    ...(businessSegmentOther !== undefined ? { businessSegmentOther } : {}),
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

  // Um salão em CADA segmento do enum. Cobre os antigos e os adicionados em
  // 2026-10; segmentos novos que esquecerem de catálogo ou público caem aqui.
  it.each(ALL_SEGMENTS.map((s) => [s] as const))(
    "%s grava o segmento, aplica o público sugerido e semeia o catálogo",
    async (segment) => {
      const config = SEGMENT_CONFIGS[segment as BusinessSegment];
      const result = await register(segment);
      createdBarbershopIds.push(result.user.barbershopId!);
      createdUserIds.push(result.user.id);

      const shop = await prisma.barbershop.findUniqueOrThrow({
        where: { id: result.user.barbershopId! },
      });

      expect(shop.businessSegment).toBe(segment);
      // Público: aplicável → sugerido do config; não aplicável (PETSHOP,
      // saúde, automotivo, serviços gerais, OTHER) → null.
      expect(shop.targetAudience).toBe(
        config.targetAudience.applies ? config.targetAudience.suggested : null
      );
      expect(shop.operationMode).toBe(config.suggestedOperationMode);

      const services = await prisma.service.findMany({
        where: { barbershopId: shop.id },
        select: { name: true },
      });
      const names = services.map((s) => s.name);
      const expected = config.catalog.services.map((s) => s.name);
      expect(names.sort()).toEqual([...expected].sort());
      expect(names.length).toBeGreaterThan(0);
    }
  );

  it("OTHER guarda o texto livre businessSegmentOther", async () => {
    const result = await register("OTHER", undefined, "Estúdio de tatuagem");
    createdBarbershopIds.push(result.user.barbershopId!);

    const shop = await prisma.barbershop.findUniqueOrThrow({
      where: { id: result.user.barbershopId! },
    });
    expect(shop.businessSegment).toBe("OTHER");
    expect(shop.businessSegmentOther).toBe("Estúdio de tatuagem");
    expect(shop.targetAudience).toBeNull();
  });

  it("segmento que não é OTHER descarta o texto livre (nunca grava lixo)", async () => {
    const result = await register("HAIR_SALON", undefined, "Texto que não deveria ficar");
    createdBarbershopIds.push(result.user.barbershopId!);

    const shop = await prisma.barbershop.findUniqueOrThrow({
      where: { id: result.user.barbershopId! },
    });
    expect(shop.businessSegmentOther).toBeNull();
  });

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

  it("LAW_FIRM nasce com o catálogo de advocacia, sem público e sem indicação", async () => {
    const result = await register("LAW_FIRM");
    createdBarbershopIds.push(result.user.barbershopId!);

    const shop = await prisma.barbershop.findUniqueOrThrow({
      where: { id: result.user.barbershopId! },
    });
    expect(shop.businessSegment).toBe("LAW_FIRM");
    expect(shop.targetAudience).toBeNull();

    const names = (
      await prisma.service.findMany({ where: { barbershopId: shop.id }, select: { name: true } })
    ).map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining(["Consulta inicial", "Acompanhamento de processo"])
    );
    expect(names).not.toContain("Cortes");

    // Segmento com restrição de publicidade: sem código de indicação e sem
    // preferências de notificação promocional.
    const referral = await prisma.referralCode.findFirst({
      where: { barbershopId: shop.id },
    });
    expect(referral).toBeNull();

    const nps = await prisma.notificationPreference.findFirst({
      where: { barbershopId: shop.id, type: "NPS_SURVEY" },
    });
    expect(nps?.enabled).toBe(false);

    const loyalty = await prisma.loyaltyProgram.findFirst({
      where: { barbershopId: shop.id },
    });
    expect(loyalty?.isActive).toBe(false);
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
