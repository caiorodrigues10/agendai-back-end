import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizeFields, sanitizeText } from "./sanitize";

interface GlyphFixture {
  cases: {
    id: string;
    max: number;
    input: string | null;
    expect: { text: string; removed: boolean; dropped: string[]; truncated: boolean };
  }[];
}

const GLYPH_FIXTURE: GlyphFixture = JSON.parse(
  readFileSync(join(__dirname, "glyphFixtures.json"), "utf8")
);

describe("sanitizeText", () => {
  it("remove emojis e mantém o texto útil (pt-BR)", () => {
    const r = sanitizeText("💈 Corte ✂️");
    expect(r.text).toBe("Corte");
    expect(r.removed).toBe(true);
  });

  it("remove caracteres CJK (sem glifo nas fontes do motor)", () => {
    const r = sanitizeText("纹身");
    expect(r.text).toBe("");
    expect(r.removed).toBe(true);
  });

  it("remove emoji+CJK misturado com acentuação preservada", () => {
    const r = sanitizeText("Barba ✨ e navalha 🪒 — Corte já! 金");
    expect(r.text).toBe("Barba e navalha — Corte já!");
    expect(r.removed).toBe(true);
  });

  it("não tem tofu: nada fora do KEEP sobrevive", () => {
    const tricky = "💈✂️🪒😀纹身日本語🚀🇺🇸\u{1F1FF}\u{1F1E7}\uFE0F\u200D";
    const r = sanitizeText(tricky);
    expect(r.text).toBe("");
    expect(r.removed).toBe(true);
  });

  it("mantém acentos, R$, € e pontuação", () => {
    const r = sanitizeText("Corte & Barba R$ 45,00 — Promoção nº 1 (50%) @spa €5");
    expect(r.text).toBe("Corte & Barba R$ 45,00 — Promoção nº 1 (50%) @spa €5");
    expect(r.removed).toBe(false);
  });

  it("colapsa espaços e trunca na fronteira de palavra (nunca no meio)", () => {
    const r = sanitizeText("   TABELA    DE   VALORES   ", 9);
    expect(r.text).toBe("TABELA");
    expect(r.removed).toBe(true);
  });

  it("título longo do pior caso corta numa palavra inteira, nunca em 'SE'", () => {
    const r = sanitizeText("TABELA DE VALORES COMPLETA DOS NOSSOS SERVIÇOS PREMIUM", 40);
    expect(r.text).toBe("TABELA DE VALORES COMPLETA DOS NOSSOS");
    expect(r.text.split(" ").pop()).toBe("NOSSOS");
  });

  it("trunca exatamente no limite quando não há espaço", () => {
    const r = sanitizeText("SERVIÇOSPREMIUM", 4);
    expect(r.text).toBe("SERV");
    expect(r.text.length).toBe(4);
  });

  it("aceita null/undefined/vazio sem lançar", () => {
    expect(sanitizeText(null)).toEqual({ text: "", removed: false, dropped: [], truncated: false });
    expect(sanitizeText(undefined)).toEqual({ text: "", removed: false, dropped: [], truncated: false });
    expect(sanitizeText("")).toEqual({ text: "", removed: false, dropped: [], truncated: false });
  });
});

/**
 * Contrato único com o front (`renderTextGlyphs.ts`): mesma fixture JSON,
 * testada dos dois lados — aqui se asserta text/removed/dropped/truncated,
 * lá se asserta dropped/truncated.
 */
describe("glyphFixtures.json (contrato compartilhado com o front)", () => {
  it("fixture tem casos e ids únicos", () => {
    expect(GLYPH_FIXTURE.cases.length).toBeGreaterThan(0);
    expect(new Set(GLYPH_FIXTURE.cases.map((c) => c.id)).size).toBe(GLYPH_FIXTURE.cases.length);
  });

  for (const c of GLYPH_FIXTURE.cases) {
    it(`${c.id}: sanitizeText bate com a fixture`, () => {
      expect(sanitizeText(c.input, c.max)).toEqual(c.expect);
    });
  }
});

describe("sanitizeFields", () => {
  it("sanitiza todos os campos e acusa removedKeys", () => {
    const r = sanitizeFields(
      { title: "💈 Tabela", subtitle: "Ok", note: "纹身" },
      { title: 40 }
    );
    expect(r.values.title).toBe("Tabela");
    expect(r.values.subtitle).toBe("Ok");
    expect(r.values.note).toBe("");
    expect(r.removed).toBe(true);
    expect(r.removedKeys.sort()).toEqual(["note", "title"]);
  });

  it("removed=false quando nada mudou", () => {
    const r = sanitizeFields({ a: "Corte R$ 30" });
    expect(r.removed).toBe(false);
    expect(r.removedKeys).toEqual([]);
  });
});
