import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10)
});

export const registerSchema = z.object({
  ownerName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  email: z.string().email(),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  cpf: z.string().min(11, "CPF inválido"),
  barbershopName: z.string().min(3, "Nome do salão deve ter no mínimo 3 caracteres"),
  whatsapp: z.string().min(10, "WhatsApp inválido"),
  cnpj: z.string().optional(),
});
