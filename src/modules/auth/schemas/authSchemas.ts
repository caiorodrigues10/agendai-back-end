import { z } from "zod";
import { BusinessSegment, TargetAudience } from "@prisma/client";
import { isValidCpf, normalizeCpf, isValidCnpj, normalizeCnpj } from "@/shared/utils/cpfUtils";
import { segmentAudienceError, segmentOtherError } from "@/shared/segments";

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
  rememberMe: z.boolean().optional().default(true),
  recaptchaToken: z.string().optional().default(""),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10).optional()
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(10, "Google idToken é obrigatório")
});

const registerBaseSchema = z.object({
  ownerName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  email: z.string().email(),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  cpf: z
    .string()
    .min(11, "CPF inválido")
    .transform((v) => normalizeCpf(v))
    .refine((v) => isValidCpf(v), { message: "CPF inválido (dígitos verificadores incorretos)" }),
  barbershopName: z.string().min(3, "Nome do salão deve ter no mínimo 3 caracteres"),
  // Segmento opcional na API para não quebrar clientes antigos que não enviam;
  // a tela de cadastro exige antes de avançar. Quando ausente, o backend nasce
  // como BARBERSHOP, que é o default do banco.
  businessSegment: z.nativeEnum(BusinessSegment).optional(),
  // Texto livre "Qual é o seu tipo de negócio?" — só faz sentido em OTHER.
  businessSegmentOther: z.string().max(80).optional(),
  // Público só faz sentido em segmentos de beleza; em PETSHOP é ignorado.
  targetAudience: z.nativeEnum(TargetAudience).nullable().optional(),
  whatsapp: phoneBR,
  address: z.string().max(500).optional(),
  city: z.string().max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
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

export const registerSchema = registerBaseSchema.superRefine(segmentAudienceRefine);

/**
 * Público em segmento que não tem público é erro, não algo para ignorar em
 * silêncio — PETSHOP é o caso real. Extraído porque `.omit()`/`.extend()` do
 * Zod descartam refinamentos, então o schema do Google precisa reaplicar.
 */
function segmentAudienceRefine(
  data: {
    businessSegment?: BusinessSegment;
    targetAudience?: TargetAudience | null;
    businessSegmentOther?: string;
  },
  ctx: z.RefinementCtx
) {
  const message = segmentAudienceError(data.businessSegment, data.targetAudience);
  if (message) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["targetAudience"],
      message,
    });
  }
  const otherMessage = segmentOtherError(data.businessSegment, data.businessSegmentOther);
  if (otherMessage) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["businessSegmentOther"],
      message: otherMessage,
    });
  }
}

export const registerWithGoogleSchema = registerBaseSchema
  .omit({ email: true, password: true })
  .extend({
    idToken: z.string().min(10, "Google idToken é obrigatório"),
  })
  .superRefine(segmentAudienceRefine);

export const forgotPasswordSchema = z.object({
  email: z.string().email("E-mail inválido"),
  recaptchaToken: z.string().optional().default(""),
}).strict();

export const resetPasswordSchema = z.object({
  token: z.string().min(32, "Token inválido"),
  newPassword: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
}).strict();

/** Convite de dono de salão (assistente do master) — uso único. */
export const acceptOwnerInviteSchema = z.object({
  token: z.string().min(32, "Token inválido"),
  newPassword: z
    .string()
    .min(6, "Senha deve ter no mínimo 6 caracteres")
    .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), {
      message: "Senha deve conter letras e números",
    }),
}).strict();

export const switchAccountSchema = z.object({
  userId: z.string().uuid("ID de usuário inválido"),
}).strict();

export const sessionIdParamsSchema = z.object({
  id: z.string().uuid("ID de sessão inválido"),
}).strict();

/** Encerrar uma sessão própria (body opcional para permitir DELETE sem corpo). */
export const authRevokeSessionSchema = z
  .object({
    reason: z.string().trim().min(10).max(500).optional(),
    /** Exigido ao encerrar a sessão/dispositivo ATUAL. */
    confirmSelf: z.boolean().optional(),
  })
  .strict()
  .optional();

/** Encerrar todas as outras sessões ("Encerrar todos os outros dispositivos"). */
export const authRevokeOthersSchema = z
  .object({
    reason: z.string().trim().min(10).max(500).optional(),
  })
  .strict()
  .optional();
