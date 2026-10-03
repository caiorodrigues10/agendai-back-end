import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { rlsExtension } from "./prismaExtensions";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL não configurada");
}

const isProduction = process.env.NODE_ENV === "production";
const hasSslMode = /[?&]sslmode=/i.test(connectionString);
let poolConnectionString = connectionString;
if (hasSslMode) {
  const parsed = new URL(connectionString);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("uselibpqcompat");
  poolConnectionString = parsed.toString();
}
const pool = new Pool({
  connectionString: poolConnectionString,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 10_000),
  ssl: isProduction || hasSslMode
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" }
    : undefined,
});

/** `PrismaPg` 6.x aceita `pg.Pool` no construtor — nenhum cast é necessário. */
const adapter = new PrismaPg(pool);

const clienteBase = new PrismaClient({ adapter });

/**
 * Aplica a extensão RLS no cliente base. Função nomeada (e não `as any`)
 * porque o tipo do cliente estendido é derivado por `ReturnType`, garantindo
 * que `prisma` e `AppPrisma` nunca fiquem dessincronizados.
 */
function createPrisma(cliente: PrismaClient) {
  return cliente.$extends(rlsExtension);
}

/** Tipo do cliente Prisma com a extensão RLS — use para injeção/mocks. */
export type AppPrisma = ReturnType<typeof createPrisma>;

/**
 * Cliente dentro de `prisma.$transaction(async tx => …)`: mesmo `Omit` que o
 * Prisma aplica (`ITXClientDenyList`). Use para anotar `tx` e para parâmetros
 * que aceitam tanto o cliente completo quanto o transacional.
 */
export type AppTx = Omit<
  AppPrisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export const prisma: AppPrisma = createPrisma(clienteBase);
export { Prisma };
