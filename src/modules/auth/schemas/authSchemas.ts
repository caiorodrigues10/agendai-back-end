import { z } from "zod";
import { isValidCpf, normalizeCpf, isValidCnpj, normalizeCnpj } from "@/shared/utils/cpfUtils";

const phoneBR = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 10 && v.length <= 11, {
    message: "WhatsApp inválido (DDD + número com 8 ou 9 dígitos)",
  });

const scheduleItemSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  isOpen: z.boolean(),
  openTime: z.string().min(4).max(5),
  closeTime: z.string().min(4).max(5),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  recaptchaToken: z.string().optional().default(""),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional()
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
  termsVersion: z.string().min(1).max(20),
  termsAccepted: z.boolean().refine(v => v === true, "É necessário aceitar os Termos de Uso"),
  marketingOptIn: z.boolean().optional().default(false),
  lgpdConsent: z.boolean().refine(v => v === true, "É necessário consentir com o tratamento de dados (LGPD)"),
  recaptchaToken: z.string().optional().default(""),
  schedule: z.array(scheduleItemSchema).min(7).max(7).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("E-mail inválido"),
  recaptchaToken: z.string().optional().default(""),
}).strict();

export const resetPasswordSchema = z.object({
  token: z.string().min(32, "Token inválido"),
  newPassword: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
}).strict();
