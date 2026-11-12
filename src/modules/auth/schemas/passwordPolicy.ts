import { z } from "zod";

/**
 * Política de senha para senhas NOVAS: cadastro, redefinição de senha e
 * aceite de convite de dono.
 *
 * Regra: mínimo de 8 caracteres, com pelo menos 1 letra e 1 número.
 * Aplica-se APENAS na definição de senha — senhas já existentes não são
 * afetadas (o login não muda) e não há pedido de troca forçada.
 */
export const NEW_PASSWORD_MIN_LENGTH = 8;

export const NEW_PASSWORD_RULE_MESSAGE =
  "Senha deve ter no mínimo 8 caracteres, com pelo menos 1 letra e 1 número";

export const newPasswordSchema = z
  .string()
  .min(NEW_PASSWORD_MIN_LENGTH, NEW_PASSWORD_RULE_MESSAGE)
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), {
    message: NEW_PASSWORD_RULE_MESSAGE,
  });
