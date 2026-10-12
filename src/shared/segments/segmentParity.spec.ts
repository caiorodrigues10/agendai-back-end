import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_SEGMENTS,
  FIRST_CLASS_SEGMENTS,
  SEGMENT_CONFIGS,
  SEGMENT_LABEL_KEYS,
  getSegmentConfig,
  resolveAudienceForSegment,
  audienceAppliesTo,
} from "./index";

type ParityFile = {
  labelKeys: string[];
  allSegments: string[];
  firstClassSegments: string[];
  segments: Record<string, { firstClass: boolean; labels: Record<string, string>; targetAudience: { applies: boolean; suggested: string | null } }>;
};

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

  it("espelha labels, firstClass e targetAudience de cada segmento", () => {
    for (const segment of ALL_SEGMENTS) {
      const config = SEGMENT_CONFIGS[segment];
      expect(parity.segments[segment], `segmento ${segment} ausente no JSON`).toBeDefined();
      expect(parity.segments[segment].firstClass, `firstClass de ${segment}`).toBe(config.firstClass);
      expect(parity.segments[segment].labels, `labels de ${segment}`).toEqual(config.labels);
      expect(parity.segments[segment].targetAudience, `targetAudience de ${segment}`).toEqual(
        config.targetAudience
      );
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

describe("catálogo por segmento", () => {
  it("todo segmento first-class tem catalogo utilizavel", () => {
    for (const segment of FIRST_CLASS_SEGMENTS) {
      const { catalog } = SEGMENT_CONFIGS[segment];
      expect(catalog.serviceCategories.length, `${segment}: categorias`).toBeGreaterThanOrEqual(2);
      expect(catalog.services.length, `${segment}: serviços`).toBeGreaterThanOrEqual(3);
      for (const service of catalog.services) {
        expect(service.price, `${segment}/${service.name}: preço`).toBeGreaterThan(0);
        expect(service.avgTimeMinutes, `${segment}/${service.name}: duração`).toBeGreaterThan(0);
        expect(
          catalog.serviceCategories.some((c) => c.name === service.categoryName),
          `${segment}/${service.name}: categoria "${service.categoryName}" não existe`
        ).toBe(true);
      }
    }
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
