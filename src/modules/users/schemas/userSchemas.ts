import { z } from "zod";
import { isValidCpf, normalizeCpf } from "@/shared/utils/cpfUtils";
import { ALL_PERMISSIONS, type EmployeePermission } from "@/modules/users/dtos/IUserResponseDTO";
import {
  paginationQuerySchema as basePaginationQuerySchema,
  booleanQuerySchema,
  searchTermSchema,
  sortSchema,
} from "@/shared/utils/pagination";

const cpfSchema = z
  .string()
  .min(11, "CPF deve ter no mínimo 11 dígitos")
  .max(14, "CPF inválido")
  .refine((v) => isValidCpf(v), { message: "CPF inválido (dígitos verificadores incorretos)" })
  .transform((v) => normalizeCpf(v));

const permissionsSchema = z
  .array(z.enum(ALL_PERMISSIONS as [string, ...string[]]))
  .optional();

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
  permissions: permissionsSchema,
}).strict();

export type CreateUserDTO = z.infer<typeof createUserSchema>;
export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
export type LoginDTO = z.infer<typeof loginSchema>;
export type StaffUpdateUserDTO = z.infer<typeof staffUpdateUserSchema>;

/**
 * Campos que a listagem da equipe aceita ordenar.
 *
 * A whitelist é fechada: qualquer outro campo devolve 400. Os nomes são os
 * mesmos que aparecem na tela da equipe (`nome`, `email`, `cargo`, `criado`).
 */
export const TEAM_SORT_FIELDS = ["nome", "email", "cargo", "criado"] as const;

/**
 * Query da listagem da equipe do dono (`GET /api/users`).
 *
 * - `page`/`limit`: paginação (default e máximo 100 — o chamador que não
 *   manda `page`/`limit` continua recebendo a equipe inteira, como antes da
 *   paginação; quem paginar é que escolhe o `limit`).
 * - `search`: busca por nome ou e-mail; termo vazio vira "sem filtro".
 * - `active`: `true`/`false` — situação do membro.
 * - `role`: papel do membro. A whitelist é **apenas `OWNER` e `EMPLOYEE`** —
 *   são os papéis que formam a equipe do salão. `MASTER_ADMIN` (plataforma, não
 *   pertence a um salão) e `CUSTOMER` (papel reservado, sem uso hoje) devolvem
 *   400: filtrar por eles só produziria lista vazia.
 * - `sort`: `<campo>:<asc|desc>`, campo na whitelist acima.
 *
 * A listagem **oculta quem foi removido**: a remoção é soft-delete
 * (`active = false` + `deletedAt`), e o `deletedAt` preenchido tira o membro da
 * lista — o filtro `active` continua existindo para distinguir ativo de inativo.
 *
 * O `barbershopId` NÃO é campo do schema: ele é resolvido pelo controller a
 * partir do contexto (sessão do OWNER ou `?barbershopId=` do MASTER_ADMIN) e
 * nunca vem da query do dono.
 */
export const listTeamQuerySchema = basePaginationQuerySchema({
  defaultLimit: 100,
  maxLimit: 100,
}).extend({
  search: searchTermSchema({ max: 100 }),
  active: booleanQuerySchema.optional(),
  role: z.enum(["OWNER", "EMPLOYEE"]).optional(),
  sort: sortSchema(TEAM_SORT_FIELDS),
});

export type ListTeamQueryDTO = z.infer<typeof listTeamQuerySchema>;