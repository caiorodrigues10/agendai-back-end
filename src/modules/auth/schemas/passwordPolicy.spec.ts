/// <reference types="vitest/globals" />
import {
  NEW_PASSWORD_MIN_LENGTH,
  NEW_PASSWORD_RULE_MESSAGE,
  newPasswordSchema,
} from "./passwordPolicy";

describe("newPasswordSchema — política de senha nova", () => {
  it("aceita senha com 8+ caracteres, letra e número", () => {
    const result = newPasswordSchema.safeParse("Senha123");
    expect(result.success).toBe(true);
  });

  it("recusa senha com menos de 8 caracteres", () => {
    const result = newPasswordSchema.safeParse(`Sen${1}`);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(NEW_PASSWORD_RULE_MESSAGE);
  });

  it("recusa senha sem letra", () => {
    const result = newPasswordSchema.safeParse("12345678");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(NEW_PASSWORD_RULE_MESSAGE);
  });

  it("recusa senha sem número", () => {
    const result = newPasswordSchema.safeParse("SenhaSenha");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(NEW_PASSWORD_RULE_MESSAGE);
  });

  it("expõe o mínimo como constante única", () => {
    expect(NEW_PASSWORD_MIN_LENGTH).toBe(8);
    expect(newPasswordSchema.safeParse("Senha123").success).toBe(true);
  });
});
