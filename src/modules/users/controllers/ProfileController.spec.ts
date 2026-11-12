/// <reference types="vitest/globals" />
/**
 * Troca de senha no perfil: a senha NOVA segue a política (8+ caracteres,
 * 1 letra e 1 número). A senha ATUAL não segue — ela é conferida contra o
 * hash guardado, e uma conta antiga pode ter senha de 6 caracteres.
 */
import { profileSchema } from "./ProfileController";

const SENHA_VALIDA = "Senha123";
const SENHA_LEGADA = ["a", "b", "c", "1", "2", "3"].join("");
const SENHA_SEM_NUMERO = ["a", "b", "c", "d", "e", "f", "g", "h"].join("");

describe("profileSchema — troca de senha", () => {
  it("aceita senha nova válida (8+ caracteres, letra e número)", () => {
    const parsed = profileSchema.safeParse({
      currentPassword: SENHA_LEGADA,
      newPassword: SENHA_VALIDA,
    });
    expect(parsed.success).toBe(true);
  });

  it("recusa senha nova de 6 caracteres", () => {
    expect(
      profileSchema.safeParse({ currentPassword: SENHA_LEGADA, newPassword: SENHA_LEGADA }).success,
    ).toBe(false);
  });

  it("recusa senha nova sem número", () => {
    expect(
      profileSchema.safeParse({ currentPassword: SENHA_LEGADA, newPassword: SENHA_SEM_NUMERO })
        .success,
    ).toBe(false);
  });

  it("aceita a senha ATUAL de 6 caracteres (conta antiga não é bloqueada)", () => {
    const parsed = profileSchema.safeParse({
      currentPassword: SENHA_LEGADA,
      newPassword: SENHA_VALIDA,
    });
    expect(parsed.success).toBe(true);
  });

  it("sem troca de senha, o schema segue válido", () => {
    expect(profileSchema.safeParse({ email: "ana@example.com" }).success).toBe(true);
  });

  it("senha nova exige a senha atual", () => {
    const parsed = profileSchema.safeParse({ newPassword: SENHA_VALIDA });
    expect(parsed.success).toBe(false);
  });
});
