import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BusinessSegment } from "@prisma/client";
import {
  ALL_SEGMENTS,
  FIRST_CLASS_SEGMENTS,
  SEGMENT_CONFIGS,
  SEGMENT_LABEL_KEYS,
  getSegmentConfig,
  resolveAudienceForSegment,
  audienceAppliesTo,
  segmentAudienceError,
  normalizeSegmentOther,
  segmentOtherError,
} from "./index";
import { buildSegmentParity } from "./parity";

type ParityFile = {
  labelKeys: string[];
  allSegments: string[];
  firstClassSegments: string[];
  segments: Record<
    string,
    {
      firstClass: boolean;
      group: string;
      labels: Record<string, string>;
      targetAudience: { applies: boolean; suggested: string | null };
      suggestedOperationMode: string;
      complianceNote: string | null;
      auxiliaryProfile: string | null;
      advertisingRestricted: boolean;
      catalog: {
        serviceCategories: { name: string; icon: string }[];
        services: {
          name: string;
          price: number;
          avgTimeMinutes: number;
          icon: string;
          categoryName: string;
        }[];
      };
      schedulePreset: {
        dayOfWeek: number;
        isOpen: boolean;
        openTime: string;
        closeTime: string;
      }[];
    }
  >;
};

/**
 * Segmentos anteriores à expansão de 2026-10, que já tinham catálogo com
 * preço real de produção. Os novos usam preço 0 (placeholder) de propósito:
 * o preço é preenchido pelo dono.
 */
const PRE_EXISTING_WITH_PRICES = new Set<BusinessSegment>([
  "BARBERSHOP",
  "HAIR_SALON",
  "NAIL_STUDIO",
  "PETSHOP",
  "BEAUTY_STUDIO",
  "LASH_BROW_STUDIO",
  "AESTHETICS",
  "SPA",
]);

function readParity(): ParityFile {
  return JSON.parse(readFileSync(join(__dirname, "segmentParity.json"), "utf8"));
}

describe("segmentParity.json", () => {
  const parity = readParity();

  it("espelha as label keys do config", () => {
    expect(parity.labelKeys).toEqual([...SEGMENT_LABEL_KEYS]);
  });

  it("espelha a lista completa de segmentos", () => {
    expect(parity.allSegments).toEqual([...ALL_SEGMENTS]);
    expect(parity.firstClassSegments).toEqual([...FIRST_CLASS_SEGMENTS]);
  });

  it("espelha labels, group e targetAudience de cada segmento", () => {
    for (const segment of ALL_SEGMENTS) {
      const config = SEGMENT_CONFIGS[segment];
      expect(parity.segments[segment], `segmento ${segment} ausente no JSON`).toBeDefined();
      expect(parity.segments[segment].group, `group de ${segment}`).toBe(config.group);
      expect(parity.segments[segment].labels, `labels de ${segment}`).toEqual(config.labels);
      expect(parity.segments[segment].targetAudience, `targetAudience de ${segment}`).toEqual(
        config.targetAudience
      );
    }
  });

  it("é idêntico ao que a config central produz hoje (JSON desatualizado falha aqui)", () => {
    expect(parity).toEqual(buildSegmentParity());
  });

  it("espelha modo sugerido, aviso de saúde, ficha auxiliar, catálogo e horário", () => {
    for (const segment of ALL_SEGMENTS) {
      const config = SEGMENT_CONFIGS[segment];
      const mirror = parity.segments[segment];
      expect(mirror.suggestedOperationMode, `${segment}: suggestedOperationMode`).toBe(
        config.suggestedOperationMode
      );
      expect(mirror.complianceNote ?? null, `${segment}: complianceNote`).toBe(
        config.complianceNote ?? null
      );
      expect(mirror.auxiliaryProfile ?? null, `${segment}: auxiliaryProfile`).toBe(
        config.auxiliaryProfile ?? null
      );
      expect(mirror.advertisingRestricted ?? false, `${segment}: advertisingRestricted`).toBe(
        config.advertisingRestricted ?? false
      );
      expect(mirror.catalog, `${segment}: catalog`).toEqual(config.catalog);
      expect(mirror.schedulePreset, `${segment}: schedulePreset`).toEqual(config.schedulePreset);
    }
  });

  it("catálogo do JSON é utilizável: sem duplicatas, duração válida e categoria existente", () => {
    for (const segment of ALL_SEGMENTS) {
      const { serviceCategories, services } = parity.segments[segment].catalog;
      const categoryNames = serviceCategories.map((c) => c.name);
      expect(new Set(categoryNames).size, `${segment}: categorias duplicadas`).toBe(
        categoryNames.length
      );
      const serviceNames = services.map((s) => s.name);
      expect(new Set(serviceNames).size, `${segment}: serviços duplicados`).toBe(serviceNames.length);
      for (const service of services) {
        expect(service.avgTimeMinutes, `${segment}/${service.name}: duração`).toBeGreaterThan(0);
        expect(service.price, `${segment}/${service.name}: preço`).toBeGreaterThanOrEqual(0);
        expect(
          categoryNames.includes(service.categoryName),
          `${segment}/${service.name}: categoria "${service.categoryName}" inexistente`
        ).toBe(true);
        expect(service.icon, `${segment}/${service.name}: ícone`).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
      for (const category of serviceCategories) {
        expect(category.icon, `${segment}/${category.name}: ícone`).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("preset de horário cobre os 7 dias da semana", () => {
    for (const segment of ALL_SEGMENTS) {
      const preset = parity.segments[segment].schedulePreset;
      expect(preset.map((d) => d.dayOfWeek), `${segment}: dias`).toEqual([0, 1, 2, 3, 4, 5, 6]);
      for (const day of preset) {
        if (!day.isOpen) continue;
        expect(day.openTime, `${segment}/dia ${day.dayOfWeek}: abertura`).toMatch(/^\d{2}:\d{2}$/);
        expect(day.closeTime, `${segment}/dia ${day.dayOfWeek}: fechamento`).toMatch(/^\d{2}:\d{2}$/);
        expect(day.closeTime > day.openTime, `${segment}/dia ${day.dayOfWeek}: fecha após abrir`).toBe(
          true
        );
      }
    }
  });
});

describe("getSegmentConfig", () => {
  it("devolve a config do segmento", () => {
    expect(getSegmentConfig("PETSHOP").labels.professional).toBe("tosador(a)");
    expect(getSegmentConfig("BARBERSHOP").labels.professional).toBe("barbeiro");
  });

  it("cai no fallback OTHER para valor desconhecido", () => {
    expect(getSegmentConfig(null).segment).toBe("OTHER");
    expect(getSegmentConfig(undefined).segment).toBe("OTHER");
  });
});

describe("segmentAudienceError", () => {
  it("deixa passar par válido e público ausente", () => {
    expect(segmentAudienceError("BARBERSHOP", "FEMININO")).toBeNull();
    expect(segmentAudienceError("BARBERSHOP", undefined)).toBeNull();
    expect(segmentAudienceError("PETSHOP", undefined)).toBeNull();
    expect(segmentAudienceError(undefined, "MASCULINO")).toBeNull();
  });

  it("recusa público em PETSHOP com a mensagem usada nas rotas", () => {
    expect(segmentAudienceError("PETSHOP", "MASCULINO")).toBe(
      "Público não se aplica ao segmento PETSHOP."
    );
  });
});

describe("resolveAudienceForSegment", () => {
  it("aplica o sugerido quando o público não vem preenchido", () => {
    expect(resolveAudienceForSegment("BARBERSHOP", undefined)).toBe("MASCULINO");
    expect(resolveAudienceForSegment("NAIL_STUDIO", undefined)).toBe("FEMININO");
  });

  it("preserva o público escolhido", () => {
    expect(resolveAudienceForSegment("BARBERSHOP", "UNISSEX")).toBe("UNISSEX");
    expect(resolveAudienceForSegment("HAIR_SALON", "FEMININO")).toBe("FEMININO");
  });

  it("zera o público em PETSHOP, que não tem noção de gênero", () => {
    expect(audienceAppliesTo("PETSHOP")).toBe(false);
    expect(resolveAudienceForSegment("PETSHOP", "MASCULINO")).toBeNull();
    expect(resolveAudienceForSegment("PETSHOP", undefined)).toBeNull();
  });
});

describe("normalizeSegmentOther", () => {
  it("guarda o texto limpo quando o segmento é OTHER", () => {
    expect(normalizeSegmentOther("OTHER", "  Estúdio   de tatuagem\tcom piercing  ")).toBe(
      "Estúdio de tatuagem com piercing"
    );
  });

  it("zera o texto fora de OTHER (nunca gravar lixo em outros segmentos)", () => {
    expect(normalizeSegmentOther("HAIR_SALON", "Texto órfão")).toBeNull();
    expect(normalizeSegmentOther("BARBERSHOP", "x")).toBeNull();
    expect(normalizeSegmentOther(undefined, "x")).toBeNull();
  });

  it("OTHER sem texto devolve null (campo opcional)", () => {
    expect(normalizeSegmentOther("OTHER", undefined)).toBeNull();
    expect(normalizeSegmentOther("OTHER", "")).toBeNull();
    expect(normalizeSegmentOther("OTHER", "   ")).toBeNull();
  });

  it("remove caracteres de controle e corta em 80 chars", () => {
    // Controles viram espaço (não somem), senão "a\tb" viraria "ab".
    expect(normalizeSegmentOther("OTHER", "Linha1\nLinha2\u0000fim")).toBe("Linha1 Linha2 fim");
    expect(normalizeSegmentOther("OTHER", "x".repeat(200))).toHaveLength(80);
  });
});

describe("segmentOtherError", () => {
  it("deixa passar texto válido ou ausente em OTHER", () => {
    expect(segmentOtherError("OTHER", "Academia de boxe")).toBeNull();
    expect(segmentOtherError("OTHER", undefined)).toBeNull();
    expect(segmentOtherError("OTHER", "x".repeat(80))).toBeNull();
  });

  it("recusa texto acima de 80 com a mensagem usada nas rotas", () => {
    expect(segmentOtherError("OTHER", "x".repeat(81))).toBe(
      "Descreva seu negócio em até 80 caracteres."
    );
  });

  it("não valida texto fora de OTHER (o normalizador zera de qualquer forma)", () => {
    expect(segmentOtherError("HAIR_SALON", "x".repeat(200))).toBeNull();
  });
});

describe("catálogo por segmento", () => {
  it("todo segmento tem catálogo utilizável (categorias, serviços e duração)", () => {
    for (const segment of ALL_SEGMENTS) {
      const { catalog } = SEGMENT_CONFIGS[segment];
      expect(catalog.serviceCategories.length, `${segment}: categorias`).toBeGreaterThanOrEqual(1);
      expect(catalog.services.length, `${segment}: serviços`).toBeGreaterThanOrEqual(1);
      for (const service of catalog.services) {
        expect(service.price, `${segment}/${service.name}: preço`).toBeGreaterThanOrEqual(0);
        expect(service.avgTimeMinutes, `${segment}/${service.name}: duração`).toBeGreaterThan(0);
        expect(
          catalog.serviceCategories.some((c) => c.name === service.categoryName),
          `${segment}/${service.name}: categoria "${service.categoryName}" não existe`
        ).toBe(true);
      }
    }
  });

  it("segmentos anteriores têm preço real preenchido — não são placeholder", () => {
    for (const segment of PRE_EXISTING_WITH_PRICES) {
      for (const service of SEGMENT_CONFIGS[segment].catalog.services) {
        expect(service.price, `${segment}/${service.name}: preço`).toBeGreaterThan(0);
      }
    }
  });

  it("segmentos novos usam preço 0 (placeholder) — o dono preenche", () => {
    for (const segment of ALL_SEGMENTS) {
      if (PRE_EXISTING_WITH_PRICES.has(segment)) continue;
      for (const service of SEGMENT_CONFIGS[segment].catalog.services) {
        expect(service.price, `${segment}/${service.name}: preço`).toBe(0);
      }
    }
  });

  it("segmentos de saúde carregam o aviso de que não é prontuário", () => {
    for (const segment of ["PHYSIOTHERAPY", "NUTRITION", "PSYCHOTHERAPY"] as const) {
      expect(
        SEGMENT_CONFIGS[segment].complianceNote,
        `${segment}: complianceNote ausente`
      ).toBeTruthy();
    }
  });

  it("advocacia carrega o aviso de validar com advogado/OAB antes de divulgar", () => {
    const note = SEGMENT_CONFIGS.LAW_FIRM.complianceNote ?? "";
    expect(note).toContain("advogado");
    expect(note.toLowerCase()).toContain("oab");
    expect(SEGMENT_CONFIGS.LAW_FIRM.advertisingRestricted).toBe(true);
  });

  it("só a advocacia restringe publicidade", () => {
    const restricted = ALL_SEGMENTS.filter(
      (segment) => SEGMENT_CONFIGS[segment].advertisingRestricted === true
    );
    expect(restricted).toEqual(["LAW_FIRM"]);
  });

  it("PETSHOP cobre o catálogo pedido: banho, tosa, cuidados", () => {
    const names = SEGMENT_CONFIGS.PETSHOP.catalog.services.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Banho",
        "Tosa higiênica",
        "Tosa completa",
        "Banho + tosa",
        "Hidratação de pelagem",
        "Corte de unhas",
        "Limpeza de ouvidos",
      ])
    );
  });

  it("BARBEARIA cobre corte, barba, corte+barba, sobrancelha e pigmentação", () => {
    const names = SEGMENT_CONFIGS.BARBERSHOP.catalog.services.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining(["Corte", "Barba", "Corte + barba", "Sobrancelha", "Pigmentação de barba"])
    );
  });

  it("CABELEREIRO cobre corte, escova, coloração, mechas, hidratação e progressiva", () => {
    const names = SEGMENT_CONFIGS.HAIR_SALON.catalog.services.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Corte feminino",
        "Corte masculino",
        "Escova",
        "Coloração",
        "Mechas",
        "Hidratação",
        "Progressiva",
      ])
    );
  });

  it("NAILS cobre manicure, pedicure, gel, alongamento, nail art e remoção", () => {
    const names = SEGMENT_CONFIGS.NAIL_STUDIO.catalog.services.map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Manicure",
        "Pedicure",
        "Esmaltação em gel",
        "Alongamento em fibra",
        "Alongamento em gel",
        "Nail art",
        "Remoção",
      ])
    );
  });
});
