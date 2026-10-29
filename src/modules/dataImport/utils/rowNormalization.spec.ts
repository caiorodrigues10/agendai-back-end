import { describe, expect, it } from "vitest";
import {
  normalizeDate,
  normalizeEmail,
  normalizeInteger,
  normalizeMoney,
  normalizePhone,
  normalizeTime,
} from "./rowNormalization";

describe("normalizeDate", () => {
  it("converte dd/mm/aaaa", () => {
    expect(normalizeDate("05/11/2026")).toBe("2026-11-05");
  });

  it("converte dd-mm-aa (dois dígitos)", () => {
    expect(normalizeDate("05-11-26")).toBe("2026-11-05");
  });

  it("converte aaaa-mm-dd", () => {
    expect(normalizeDate("2026-11-05")).toBe("2026-11-05");
  });

  it("converte serial do Excel", () => {
    // 46000 = 09/12/2025 na base 30/12/1899.
    expect(normalizeDate("46000")).toBe("2025-12-09");
  });

  it("recusa data impossível", () => {
    expect(normalizeDate("32/13/2026")).toBeNull();
  });

  it("recusa texto sem data", () => {
    expect(normalizeDate("amanhã")).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });
});

describe("normalizeTime", () => {
  it("converte hh:mm", () => {
    expect(normalizeTime("14:30")).toBe("14:30");
  });

  it("converte hh:mm:ss", () => {
    expect(normalizeTime("14:30:00")).toBe("14:30");
  });

  it("converte hh:mm:ss com um dígito na hora", () => {
    expect(normalizeTime("9:05")).toBe("09:05");
  });

  it("converte 14h30", () => {
    expect(normalizeTime("14h30")).toBe("14:30");
  });

  it("converte fração de dia do Excel", () => {
    expect(normalizeTime("0.5")).toBe("12:00");
  });

  it("recusa hora inválida", () => {
    expect(normalizeTime("25:00")).toBeNull();
    expect(normalizeTime("10:75")).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("mantém o número nacional com DDD", () => {
    expect(normalizePhone("11987654321")).toBe("11987654321");
  });

  it("remove o código do país", () => {
    expect(normalizePhone("+55 11 98765-4321")).toBe("11987654321");
  });

  it("recusa número curto demais", () => {
    expect(normalizePhone("1234")).toBeNull();
  });

  it("recusa número longo demais", () => {
    expect(normalizePhone("119876543211234")).toBeNull();
  });

  it("recusa vazio", () => {
    expect(normalizePhone("")).toBeNull();
  });
});

describe("normalizeMoney", () => {
  it("converte formato brasileiro", () => {
    expect(normalizeMoney("1.234,56")).toBe(1234.56);
  });

  it("converte formato americano", () => {
    expect(normalizeMoney("1234.56")).toBe(1234.56);
  });

  it("remove prefixo de moeda", () => {
    expect(normalizeMoney("R$ 80,00")).toBe(80);
  });

  it("trata milhar com ponto", () => {
    expect(normalizeMoney("1.500")).toBe(1500);
  });

  it("recusa valor negativo", () => {
    expect(normalizeMoney("-50")).toBeNull();
  });

  it("recusa texto", () => {
    expect(normalizeMoney("abc")).toBeNull();
  });
});

describe("normalizeInteger", () => {
  it("converte minutos", () => {
    expect(normalizeInteger("45")).toBe(45);
  });

  it("arredonda", () => {
    expect(normalizeInteger("45,6")).toBe(46);
  });

  it("recusa texto", () => {
    expect(normalizeInteger("abc")).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("baixa a caixa", () => {
    expect(normalizeEmail("Ana@Exemplo.COM")).toBe("ana@exemplo.com");
  });

  it("recusa e-mail inválido", () => {
    expect(normalizeEmail("ana@")).toBeNull();
    expect(normalizeEmail("ana")).toBeNull();
  });
});
