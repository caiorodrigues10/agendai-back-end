import { z } from "zod";
import { adminAccountReasonSchema } from "./adminAccountsSchemas";

export const whatsappPlatformSettingsPutSchema = z
  .object({
    aiGloballyEnabled: z.boolean().optional(),
    ownerBotGloballyEnabled: z.boolean().optional(),
    outboundPaused: z.boolean().optional(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

export const whatsappReasonSchema = z
  .object({
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

export const whatsappPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const whatsappQueueNameSchema = z.enum(["whatsapp", "whatsapp-ai", "owner-bot"]);

export const whatsappQueueParamsSchema = z.object({
  queue: whatsappQueueNameSchema,
  jobId: z.string().trim().min(1).max(200),
});

export const whatsappInstanceReasonSchema = whatsappReasonSchema;

export const whatsappBatchIdsSchema = z
  .array(z.string().uuid())
  .min(1)
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, "ids duplicados");

export const whatsappBatchAiSchema = z
  .object({
    ids: whatsappBatchIdsSchema,
    enabled: z.boolean(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

export const whatsappBatchOwnerBotSchema = z
  .object({
    ids: whatsappBatchIdsSchema,
    enabled: z.boolean().optional(),
    blocked: z.boolean().optional(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict()
  .refine((v) => v.enabled !== undefined || v.blocked !== undefined, "Informe enabled ou blocked");


export const whatsappPatchShopAiSchema = z
  .object({
    enabled: z.boolean(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();

export const whatsappPatchShopOwnerBotSchema = z
  .object({
    enabled: z.boolean().optional(),
    blocked: z.boolean().optional(),
    revokeLinks: z.boolean().optional(),
    reason: z.string().trim().min(10).max(500),
  })
  .strict()
  .refine((v) => v.enabled !== undefined || v.blocked !== undefined || v.revokeLinks !== undefined, "Informe ao menos um campo");
