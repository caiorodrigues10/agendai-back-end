import { describe, expect, it } from "vitest";
import { checkCnjCheckDigit } from "./cnj";

describe("checkCnjCheckDigit", () => {
  it("aceita processo público 1024127-78.2020.8.26.0100 (TJSP)", () => {
    expect(checkCnjCheckDigit("1024127-78.2020.8.26.0100")).toBe("valid");
  });

  it("aceita processo público 0025900-78.2020.8.26.0100 (TJSP)", () => {
    expect(checkCnjCheckDigit("0025900-78.2020.8.26.0100")).toBe("valid");
  });

  it("aponta dígito verificador incorreto", () => {
    expect(checkCnjCheckDigit("0000001-02.2020.8.26.0100")).toBe("invalid");
  });

  it("não valida quando o tribunal vem em letras (formato legado)", () => {
    expect(checkCnjCheckDigit("0000001-02.2020.8.SP.0100")).toBe("unknown");
  });

  it("não valida formato incompleto", () => {
    expect(checkCnjCheckDigit("123")).toBe("unknown");
  });
});
