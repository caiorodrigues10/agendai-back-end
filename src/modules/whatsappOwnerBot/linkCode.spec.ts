import { describe, expect, it } from "vitest";
import {
  generateOwnerBotLinkCode,
  hashOwnerBotLinkCode,
  verifyOwnerBotLinkCode,
} from "./linkCode";

describe("código de vínculo", () => {
  it("gera 6 caracteres sem caracteres confusos", () => {
    for (let index = 0; index < 50; index += 1) {
      const code = generateOwnerBotLinkCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it("não guarda o código em texto puro", () => {
    const code = generateOwnerBotLinkCode();
    const hash = hashOwnerBotLinkCode(code);
    expect(hash).not.toContain(code);
    expect(hash).toHaveLength(64);
  });

  it("compara em tempo constante e rejeita código diferente", () => {
    const code = generateOwnerBotLinkCode();
    const hash = hashOwnerBotLinkCode(code);
    expect(verifyOwnerBotLinkCode(code, hash)).toBe(true);
    expect(verifyOwnerBotLinkCode(code.toLowerCase(), hash)).toBe(true);
    expect(verifyOwnerBotLinkCode("ZZZZZZ", hash)).toBe(false);
    expect(verifyOwnerBotLinkCode(code, "")).toBe(false);
  });
});
