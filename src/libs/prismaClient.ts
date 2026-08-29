import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { rlsExtension } from "./prismaExtensions";

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});
const adapter = new PrismaPg(pool as any);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any = new PrismaClient({ adapter: adapter as any } as any).$extends(rlsExtension);
export { Prisma };
