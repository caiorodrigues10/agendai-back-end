/**
 * Postgres de integração.
 *
 * Padrão: usa DATABASE_URL do ambiente (docker compose local na 5442).
 * Com USE_TESTCONTAINERS=1: sobe @testcontainers/postgresql (requer Docker).
 *
 * vitest-environment-vprisma foi avaliado e não encaixa bem no Prisma 6 +
 * adapter-pg deste monorepo — lifecycle fica neste helper.
 */
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

export type PostgresHarness = {
  connectionString: string;
  stop: () => Promise<void>;
};

export async function startPostgresHarness(): Promise<PostgresHarness> {
  if (process.env.USE_TESTCONTAINERS === "1") {
    const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
    const container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("agendai_test")
      .withUsername("agendai")
      .withPassword("agendai123")
      .start();

    const connectionString = container.getConnectionUri();
    process.env.DATABASE_URL = connectionString;

    execSync("npx prisma db push --skip-generate", {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: connectionString },
      cwd: process.cwd(),
    });

    return {
      connectionString,
      stop: async () => {
        await container.stop();
      },
    };
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL ausente. Suba o Postgres (`docker compose up -d database`) ou use USE_TESTCONTAINERS=1.",
    );
  }

  return {
    connectionString,
    stop: async () => {
      /* host DB — não derruba */
    },
  };
}

/** Prisma efêmero só para asserts de setup (não substitui o singleton da app). */
export function createProbePrisma(url = process.env.DATABASE_URL) {
  return new PrismaClient({
    datasources: { db: { url } },
  });
}
