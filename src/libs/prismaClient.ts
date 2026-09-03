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
const adapter = new PrismaPg(pool as any);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any = new PrismaClient({ adapter: adapter as any } as any).$extends(rlsExtension);
export { Prisma };
