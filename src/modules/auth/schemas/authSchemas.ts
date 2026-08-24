import { z } from "zod";
import { isValidCpf, normalizeCpf, isValidCnpj, normalizeCnpj } from "@/shared/utils/cpfUtils";

const phoneBR = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 10 && v.length <= 11, {
    message: "WhatsApp inválido (DDD + número com 8 ou 9 dígitos)",
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10)
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(10, "Google idToken é obrigatório")
});

export const registerSchema = z.object({
  ownerName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  email: z.string().email(),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  cpf: z
    .string()
    .min(11, "CPF inválido")
    .transform((v) => normalizeCpf(v))
    .refine((v) => isValidCpf(v), { message: "CPF inválido (dígitos verificadores incorretos)" }),
  barbershopName: z.string().min(3, "Nome do salão deve ter no mínimo 3 caracteres"),
  whatsapp: phoneBR,
  cnpj: z
    .string()
    .optional()
    .refine((v) => !v || isValidCnpj(v), { message: "CNPJ inválido (dígitos verificadores incorretos)" })
    .transform((v) => (v ? normalizeCnpj(v) : v)),
  referralCode: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined)),
});
