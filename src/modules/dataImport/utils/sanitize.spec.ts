import { describe, expect, it } from "vitest";
import {
  buildErrorCsv,
  createSafeRecord,
  isDangerousKey,
  neutralizeCsvFormula,
  sanitizeCellText,
} from "./sanitize";

describe("isDangerousKey", () => {
  it("reconhece as chaves de prototype pollution", () => {
    expect(isDangerousKey("__proto__")).toBe(true);
    expect(isDangerousKey("constructor")).toBe(true);
    expect(isDangerousKey("prototype")).toBe(true);
    expect(isDangerousKey("Nome")).toBe(false);
  });
});

describe("createSafeRecord", () => {
  it("cria objeto sem prototype", () => {
    const record = createSafeRecord<string>();
    record["__proto__"] = "injetado";
    expect(Object.getPrototypeOf(record)).toBeNull();
    expect(({} as Record<string, unknown>).injetado).toBeUndefined();
  });
});

describe("sanitizeCellText", () => {
  it("remove caracteres de controle", () => {
    expect(sanitizeCellText("An\u0000a\u0007", 100)).toBe("Ana");
  });

  it("normaliza CRLF", () => {
    expect(sanitizeCellText("a\r\nb", 100)).toBe("a\nb");
  });

  it("corta o tamanho máximo", () => {
    expect(sanitizeCellText("abcdef", 3)).toBe("abc");
  });

  it("trata null e undefined como vazio", () => {
    expect(sanitizeCellText(null, 10)).toBe("");
    expect(sanitizeCellText(undefined, 10)).toBe("");
  });
});

describe("neutralizeCsvFormula", () => {
  it("prefixa fórmulas perigosas", () => {
    expect(neutralizeCsvFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeCsvFormula("+123")).toBe("'+123");
    expect(neutralizeCsvFormula("-123")).toBe("'-123");
    expect(neutralizeCsvFormula("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(neutralizeCsvFormula("\tX")).toBe("'\tX");
    expect(neutralizeCsvFormula("\rX")).toBe("'\rX");
  });

  it("não mexe em texto normal", () => {
    expect(neutralizeCsvFormula("Ana")).toBe("Ana");
    expect(neutralizeCsvFormula("")).toBe("");
  });
});

describe("buildErrorCsv", () => {
  it("gera CSV com cabeçalho e linhas", () => {
    const csv = buildErrorCsv([
      { Linha: "3", Situacao: "Rejeitada", Motivo: "Telefone inválido" },
      { Linha: "7", Situacao: "Ignorada", Motivo: "Cliente já cadastrado" },
    ]);
    expect(csv).toContain("Linha;Situacao;Motivo");
    expect(csv).toContain("3;Rejeitada;Telefone inválido");
    expect(csv).toContain("7;Ignorada;Cliente já cadastrado");
  });

  it("neutraliza fórmula no motivo", () => {
    const csv = buildErrorCsv([{ Linha: "1", Motivo: "=HYPERLINK(\"http://x\")" }]);
    expect(csv).toContain("'=HYPERLINK");
  });

  it("escapa aspas e separador", () => {
    const csv = buildErrorCsv([{ Linha: "1", Motivo: 'com "aspas"; e ponto e vírgula' }]);
    expect(csv).toContain('"com ""aspas""; e ponto e vírgula"');
  });

  it("devolve string vazio sem linhas", () => {
    expect(buildErrorCsv([])).toBe("");
  });
});
