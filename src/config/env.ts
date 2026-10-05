import { z } from "zod";
import type { ProcessRole } from "@/shared/config/processRole";

const PROCESS_ROLES = ["api", "worker", "scheduler", "all"] as const;

/**
 * PROCESS_ROLE:
 * - default explícito `all` (mesmo comportamento histórico de processRole.ts,
 *   que faz fallback para `all` quando a env está ausente/inválida);
 * - valor inválido FALHA o boot em NODE_ENV=production (fail fast, mensagem clara);
 * - fora de produção apenas avisa e usa o default (dev/test não quebram).
 */
const DEFAULT_PROCESS_ROLE: ProcessRole = "all";

const NOTIFICATION_V2_MODES = ["disabled", "shadow", "active"] as const;

export interface Env {
  nodeEnv: string;
  port: number;
  processRole: ProcessRole;
  dbPoolMax: number;
  dbIdleTimeoutMs: number;
  dbConnectionTimeoutMs: number;
  redisUrl: string | undefined;
  notificationV2Mode: (typeof NOTIFICATION_V2_MODES)[number];
  redisConnectTimeoutMs: number;
  redisCommandTimeoutMs: number;
  redisApiMaxRetriesPerRequest: number;
  shutdownDrainTimeoutMs: number;
}

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const intVar = (min: number, max: number, defaultValue: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(min).max(max).default(defaultValue)
  );

const envSchema = z.object({
  PORT: intVar(1, 65535, 3333),
  DB_POOL_MAX: intVar(1, 1_000, 10),
  DB_IDLE_TIMEOUT_MS: intVar(1, 600_000, 30_000),
  DB_CONNECTION_TIMEOUT_MS: intVar(1, 600_000, 10_000),
  REDIS_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^rediss?:\/\//, "deve iniciar com redis:// ou rediss://")
      .optional()
  ),
  NOTIFICATION_V2_MODE: z.preprocess(
    emptyToUndefined,
    z.enum(NOTIFICATION_V2_MODES).default("disabled")
  ),
  REDIS_CONNECT_TIMEOUT_MS: intVar(100, 120_000, 10_000),
  REDIS_COMMAND_TIMEOUT_MS: intVar(100, 120_000, 2_000),
  REDIS_API_MAX_RETRIES_PER_REQUEST: intVar(0, 10, 1),
  SHUTDOWN_DRAIN_TIMEOUT_MS: intVar(1_000, 25_000, 20_000),
});

function resolveProcessRole(
  raw: string | undefined,
  isProduction: boolean,
  issues: string[]
): ProcessRole {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PROCESS_ROLE;
  const normalized = raw.trim().toLowerCase();
  if ((PROCESS_ROLES as readonly string[]).includes(normalized)) {
    return normalized as ProcessRole;
  }
  if (isProduction) {
    issues.push(
      `PROCESS_ROLE="${raw}": use um de ${PROCESS_ROLES.join(", ")}`
    );
    return DEFAULT_PROCESS_ROLE;
  }
  console.warn(
    `[env] PROCESS_ROLE="${raw}" inválido — usando default "${DEFAULT_PROCESS_ROLE}"`
  );
  return DEFAULT_PROCESS_ROLE;
}

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const { PROCESS_ROLE: rawProcessRole, ...rest } = source;
  const parsed = envSchema.safeParse(rest);
  const issues: string[] = parsed.success
    ? []
    : parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "ENV"}: ${issue.message}`
      );

  const processRole = resolveProcessRole(
    rawProcessRole,
    source.NODE_ENV === "production",
    issues
  );

  if (!parsed.success || issues.length > 0) {
    const details = issues.length > 0 ? issues : ["falha ao validar o ambiente"];
    throw new Error(
      `Configuração inválida de variáveis de ambiente:\n- ${details.join("\n- ")}`
    );
  }

  const data = parsed.data;
  return {
    nodeEnv: source.NODE_ENV ?? "development",
    port: data.PORT,
    processRole,
    dbPoolMax: data.DB_POOL_MAX,
    dbIdleTimeoutMs: data.DB_IDLE_TIMEOUT_MS,
    dbConnectionTimeoutMs: data.DB_CONNECTION_TIMEOUT_MS,
    redisUrl: data.REDIS_URL,
    notificationV2Mode: data.NOTIFICATION_V2_MODE,
    redisConnectTimeoutMs: data.REDIS_CONNECT_TIMEOUT_MS,
    redisCommandTimeoutMs: data.REDIS_COMMAND_TIMEOUT_MS,
    redisApiMaxRetriesPerRequest: data.REDIS_API_MAX_RETRIES_PER_REQUEST,
    shutdownDrainTimeoutMs: data.SHUTDOWN_DRAIN_TIMEOUT_MS,
  };
}

export const env: Env = parseEnv();
