import { z } from "zod";
import { isValidCpf, normalizeCpf } from "@/shared/utils/cpfUtils";

const cpfSchema = z
  .string()
  .min(11, "CPF deve ter no mínimo 11 dígitos")
  .max(14, "CPF inválido")
  .refine((v) => isValidCpf(v), { message: "CPF inválido (dígitos verificadores incorretos)" })
  .transform((v) => normalizeCpf(v));

export const createUserSchema = z.object({
  name: z
    .string()
    .min(3, "Nome deve ter no mínimo 3 caracteres")
    .max(200, "Nome muito longo"),
  email: z.string().email("E-mail inválido").max(100, "E-mail muito longo"),
  password: z
    .string()
    .min(6, "Senha deve ter no mínimo 6 caracteres")
    .max(100, "Senha muito longa"),
  role: z.enum(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]).optional(),
  barbershopId: z.string().uuid("ID de salão inválido").optional(),
  cpf: cpfSchema.optional()
}).superRefine((data, ctx) => {
  const role = data.role ?? "EMPLOYEE";

  // Regras de barbershopId
  if (role === "MASTER_ADMIN" && data.barbershopId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["barbershopId"],
      message: "Admins não devem possuir salão vinculado"
    });
  }
  if (role !== "MASTER_ADMIN" && !data.barbershopId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["barbershopId"],
      message: "barbershopId é obrigatório para OWNER e EMPLOYEE"
    });
  }

  // CPF obrigatório para OWNER e EMPLOYEE
  if (role !== "MASTER_ADMIN" && !data.cpf) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cpf"],
      message: "CPF é obrigatório para OWNER e EMPLOYEE"
    });
  }
});

export const updateUserSchema = z
  .object({
    name: z.string().min(3).max(200).optional(),
    email: z.string().email().max(100).optional(),
    password: z.string().min(6).max(100).optional(),
    role: z.enum(["MASTER_ADMIN", "OWNER", "EMPLOYEE"]).optional(),
    barbershopId: z.string().uuid().optional(),
    cpf: cpfSchema.optional()
  })
  .superRefine((data, ctx) => {
    if (data.role && data.role !== "MASTER_ADMIN" && !data.barbershopId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["barbershopId"],
        message: "barbershopId é obrigatório ao definir role OWNER ou EMPLOYEE"
      });
    }
    if (data.role === "MASTER_ADMIN" && data.barbershopId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["barbershopId"],
        message: "Admins não devem possuir salão vinculado"
      });
    }
  });

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha obrigatória")
});

/** Schema para OWNER/EMPLOYEE atualizar membros da equipe. */
export const staffUpdateUserSchema = z.object({
  name: z.string().min(3).max(200).optional(),
  email: z.string().email().max(100).optional(),
  role: z.enum(["OWNER", "EMPLOYEE"]).optional(),
  active: z.boolean().optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
}).strict();

export type CreateUserDTO = z.infer<typeof createUserSchema>;
export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
export type LoginDTO = z.infer<typeof loginSchema>;
export type StaffUpdateUserDTO = z.infer<typeof staffUpdateUserSchema>;