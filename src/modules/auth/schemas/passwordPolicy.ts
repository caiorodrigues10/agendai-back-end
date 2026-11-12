import { z } from "zod";

/**
 * Política de senha para senhas NOVAS: cadastro, redefinição de senha, troca
 * de senha, aceite de convite e criação de usuário (dono/master).
 *
 * Regra: mínimo de 8 caracteres, com pelo menos 1 letra e 1 número.
 * Aplica-se APENAS na definição de senha — senhas já existentes não são
 * afetadas (o login não muda) e não há pedido de troca forçada.
 */
export const NEW_PASSWORD_MIN_LENGTH = 8;
export const NEW_PASSWORD_MAX_LENGTH = 100;

export const NEW_PASSWORD_RULE_MESSAGE =
  "Senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra e 1 número";

export const NEW_PASSWORD_MAX_LENGTH_MESSAGE = "Senha muito longa";

/**
 * Schema da senha nova.
 *
 * `maxLength` é opcional para preservar o limite de tamanho que cada fluxo já
 * usava (100 caracteres) sem duplicar a regra em cada schema.
 */
export function buildNewPasswordSchema(maxLength?: number) {
  const base =
    maxLength === undefined
      ? z.string()
      : z.string().max(maxLength, NEW_PASSWORD_MAX_LENGTH_MESSAGE);

  return base
    .min(NEW_PASSWORD_MIN_LENGTH, NEW_PASSWORD_RULE_MESSAGE)
    .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), {
      message: NEW_PASSWORD_RULE_MESSAGE,
    });
}

/** Senha nova sem limite extra de tamanho (fluxos que nunca tiveram um). */
export const newPasswordSchema = buildNewPasswordSchema();
