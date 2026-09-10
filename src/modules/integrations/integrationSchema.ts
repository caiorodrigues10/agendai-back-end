import { z } from "zod";

const googleCalendarConfig = z.object({
  calendarId: z.string().min(1).max(200),
  syncDirection: z.enum(["INBOUND", "OUTBOUND", "BIDIRECTIONAL"]).default("BIDIRECTIONAL"),
}).partial();

const icalConfig = z.object({
  url: z.string().url().max(500),
  syncDirection: z.enum(["INBOUND", "OUTBOUND", "BIDIRECTIONAL"]).default("INBOUND"),
}).partial();

const twilioConfig = z.object({
  accountSid: z.string().min(1).max(100),
  authToken: z.string().min(1).max(200),
  fromNumber: z.string().min(1).max(20),
}).partial();

const evolutionApiConfig = z.object({
  instanceName: z.string().min(1).max(100),
  apiUrl: z.string().url().max(300),
}).partial();

const openaiConfig = z.object({
  model: z.string().min(1).max(100).default("gpt-4o"),
  maxTokens: z.number().int().min(1).max(8000).default(1000),
}).partial();

const asaasConfig = z.object({
  apiKey: z.string().min(1).max(200),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
}).partial();

const zapiConfig = z.object({
  instanceName: z.string().min(1).max(100),
  apiKey: z.string().min(1).max(200),
  apiUrl: z.string().url().max(300).optional(),
}).partial();

const whatsappCloudConfig = z.object({
  phoneNumberId: z.string().min(1).max(100),
  accessToken: z.string().min(1).max(500),
  webhookVerifyToken: z.string().min(1).max(200).optional(),
}).partial();

const nfsConfig = z.object({}).partial();

const configSchemas: Record<string, z.ZodObject<any>> = {
  GOOGLE_CALENDAR: googleCalendarConfig,
  ICALENDAR: icalConfig,
  TWILIO: twilioConfig,
  EVOLUTION_API: evolutionApiConfig,
  OPENAI: openaiConfig,
  ASAAS: asaasConfig,
  ZAPI: zapiConfig,
  WHATSAPP_CLOUD: whatsappCloudConfig,
  NFSE: nfsConfig,
};

const credentialSchemas: Record<string, z.ZodObject<any> | undefined> = {
  GOOGLE_CALENDAR: z.object({ accessToken: z.string().min(1), refreshToken: z.string().min(1) }).partial(),
  TWILIO: z.object({ accountSid: z.string().min(1), authToken: z.string().min(1) }).partial(),
  EVOLUTION_API: z.object({ apiKey: z.string().min(1) }).partial(),
  OPENAI: z.object({ apiKey: z.string().min(1) }).partial(),
  ASAAS: z.object({ apiKey: z.string().min(1) }).partial(),
  ZAPI: z.object({ apiKey: z.string().min(1) }).partial(),
  WHATSAPP_CLOUD: z.object({ accessToken: z.string().min(1) }).partial(),
};

export const createIntegrationSchema = z.object({
  type: z.enum([
    "GOOGLE_CALENDAR",
    "ICALENDAR",
    "TWILIO",
    "EVOLUTION_API",
    "OPENAI",
    "ASAAS",
    "NFSE",
    "ZAPI",
    "WHATSAPP_CLOUD",
  ]),
  provider: z.string().trim().min(1).max(100),
  config: z.record(z.unknown()).default({}),
  credentials: z.record(z.unknown()).default({}),
  status: z.enum(["ACTIVE", "INACTIVE", "ERROR", "RATE_LIMITED"]).optional(),
}).superRefine((data, ctx) => {
  const cfgSchema = configSchemas[data.type];
  if (cfgSchema) {
    const result = cfgSchema.safeParse(data.config);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `config.${issue.path.join(".")}: ${issue.message}`, path: ["config"] });
      }
    }
  }
  const credSchema = credentialSchemas[data.type];
  if (credSchema) {
    const result = credSchema.safeParse(data.credentials);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `credentials.${issue.path.join(".")}: ${issue.message}`, path: ["credentials"] });
      }
    }
  }
});

export const updateIntegrationSchema = z.object({
  config: z.record(z.unknown()).optional(),
  credentials: z.record(z.unknown()).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ERROR", "RATE_LIMITED"]).optional(),
});

export const testIntegrationSchema = z.object({});

export const triggerSyncSchema = z.object({
  direction: z.enum(["INBOUND", "OUTBOUND", "BIDIRECTIONAL"]).optional(),
});
