import { z } from "zod";
import { BusinessSegment, OpeningMode, TargetAudience } from "@prisma/client";
import { isValidCnpj, normalizeCnpj } from "@/shared/utils/cpfUtils";
import { segmentAudienceError, segmentOtherError } from "@/shared/segments";
import { buildSocialLinksUpdate } from "@/modules/barbershops/utils/socialLinks";
import {
  isValidOabRegistration,
  normalizeOabRegistration,
} from "@/modules/barbershops/utils/oabRegistration";

const phoneBR = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 10 && v.length <= 11, {
    message: "WhatsApp inválido (DDD + número com 8 ou 9 dígitos)",
  });

export const createBarbershopSchema = z
  .object({
    name: z.string().min(2).max(200),
    whatsapp: phoneBR,
    logoUrl: z.string().url().max(500).optional(),
    googleReviewUrl: z.string().url().max(500).optional(),
    cnpj: z
      .string()
      .optional()
      .refine((v) => !v || isValidCnpj(v), { message: "CNPJ inválido (dígitos verificadores incorretos)" })
      .transform((v) => (v ? normalizeCnpj(v) : v)),
    address: z.string().max(500).optional(),
    city: z.string().max(120).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    businessSegment: z.nativeEnum(BusinessSegment).optional(),
    // Texto livre "Qual é o seu tipo de negócio?" — só faz sentido em OTHER.
    businessSegmentOther: z.string().max(80).optional(),
    targetAudience: z.nativeEnum(TargetAudience).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const message = segmentAudienceError(data.businessSegment, data.targetAudience);
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetAudience"], message });
    }
    const otherMessage = segmentOtherError(data.businessSegment, data.businessSegmentOther);
    if (otherMessage) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["businessSegmentOther"], message: otherMessage });
    }
  });

export const updateBarbershopSchema = z
  .object({
    name: z.string().min(2).max(200).optional(),
    whatsapp: phoneBR.optional(),
    logoUrl: z.string().url().max(500).nullable().optional(),
    googleReviewUrl: z.string().url().max(500).nullable().optional(),
    active: z.boolean().optional(),
    cnpj: z
      .string()
      .optional()
      .refine((v) => !v || isValidCnpj(v), { message: "CNPJ inválido (dígitos verificadores incorretos)" })
      .transform((v) => (v ? normalizeCnpj(v) : v)),
    address: z.string().max(500).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    openingMode: z.nativeEnum(OpeningMode).optional(),
    // nativeEnum deriva do Prisma: um z.enum listado à mão já ficou para trás
    // quando PETSHOP entrou no schema.
    businessSegment: z.nativeEnum(BusinessSegment).optional(),
    businessSegmentOther: z.string().max(80).optional(),
    targetAudience: z.nativeEnum(TargetAudience).nullable().optional(),
    // Redes sociais do dono no perfil público: mapa rede → URL. Valida e
    // normaliza por rede (utils/socialLinks); entrada vazia remove a rede;
    // mapa final vazio grava null (perfil sem redes não mostra nada).
    socialLinks: z
      .record(z.union([z.string().max(1000), z.null()]))
      .optional()
      .superRefine((value, ctx) => {
        if (!value) return;
        const { errors } = buildSocialLinksUpdate(value);
        for (const [key, message] of Object.entries(errors)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message });
        }
      })
      .transform((value) => (value ? buildSocialLinksUpdate(value).links : undefined)),
    // Áreas de atuação do escritório: tags livres configuráveis em
    // Configurações. Aparecem no perfil público e classificam atendimentos.
    practiceAreas: z
      .array(z.string().min(1).max(60))
      .max(20, "Máximo de 20 áreas de atuação")
      .optional(),
    // Registro na OAB do estabelecimento: texto livre opcional com validação
    // leve de formato (UF + número). Sem consulta externa.
    oabRegistration: z
      .string()
      .max(40)
      .nullable()
      .optional()
      .refine((value) => !value || isValidOabRegistration(value), {
        message: "Registro da OAB inválido (use o formato SP 123456)",
      })
      .transform((value) => (value ? normalizeOabRegistration(value) : value)),
  })
  // Mesma regra do cadastro: trocar o segmento para PETSHOP não pode deixar
  // um público antigo colado no registro.
  .superRefine((data, ctx) => {
    const message = segmentAudienceError(data.businessSegment, data.targetAudience);
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["targetAudience"], message });
    }
    const otherMessage = segmentOtherError(data.businessSegment, data.businessSegmentOther);
    if (otherMessage) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["businessSegmentOther"], message: otherMessage });
    }
  });

export const scheduleItemSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  isOpen: z.boolean(),
  openTime: z.string().min(4).max(5),
  closeTime: z.string().min(4).max(5)
});

export const updateScheduleSchema = z.array(scheduleItemSchema).min(1);

/**
 * Listagem pública GET /barbershops (M7): o parâmetro ?limit era ignorado.
 * Sem parâmetros o comportamento segue sendo a lista completa (contrato atual
 * do showcase); com parâmetros, paginação real e limitado a 100 por página.
 */
export const listBarbershopsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
