import { z } from "zod";
import {
  paginationQuerySchema as basePaginationQuerySchema,
  searchTermSchema,
  dateOnlySchema,
  booleanQuerySchema,
  sortSchema,
} from "@/shared/utils/pagination";

const phoneBR = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 10 && v.length <= 11, {
    message: "WhatsApp inválido (DDD + número com 8 ou 9 dígitos)",
  });

export const createClientSchema = z.object({
  barbershopId: z.string().uuid().optional(),
  name: z.string().min(2, "Nome obrigatório").max(200),
  whatsapp: phoneBR.optional().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable(),
  marketingOptIn: z.boolean().optional(),
  marketingOptInSource: z.string().max(80).optional().nullable(),
});

export const updateClientSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  // "" é válido: limpa o WhatsApp (paridade com createClientSchema)
  whatsapp: phoneBR.optional().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable(),
  marketingOptIn: z.boolean().optional(),
  marketingOptInSource: z.string().max(80).optional().nullable(),
});

/** Campos que a listagem de clientes aceita ordenar. */
export const CLIENT_SORT_FIELDS = ["name", "lastVisitAt", "createdAt"] as const;

export const listClientsQuerySchema = basePaginationQuerySchema({
  defaultLimit: 20,
  maxLimit: 100,
})
  .extend({
    // max generoso: busca longa não pode derrubar a listagem inteira com 400
    // busca vazia (ou só espaços) vira undefined = "sem filtro"
    search: searchTermSchema({ max: 300 }),
    /** Intervalo civil de criação (YYYY-MM-DD), convertido para limites UTC do dia. */
    createdFrom: dateOnlySchema.optional(),
    createdTo: dateOnlySchema.optional(),
    /** Sem visita há N dias: `lastVisitAt` antigo ou, se nunca visitou, `createdAt` antigo. */
    inactiveDays: z.coerce.number().int().min(1).max(3650).optional(),
    /** Clientes com (ou sem) fiado em aberto — vínculo por `Fiado.clientId`. */
    hasOpenFiado: booleanQuerySchema.optional(),
    /** Clientes com (ou sem) pacote ativo — `ClientPackage.status = ACTIVE`. */
    hasActivePackage: booleanQuerySchema.optional(),
    sort: sortSchema(CLIENT_SORT_FIELDS),
  })
  .refine((v) => !(v.createdFrom && v.createdTo && v.createdFrom > v.createdTo), {
    message: "`createdFrom` não pode ser depois de `createdTo`",
    path: ["createdFrom"],
  });

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ListClientsQueryInput = z.infer<typeof listClientsQuerySchema>;
