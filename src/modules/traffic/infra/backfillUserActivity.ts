import { prisma } from "@/libs/prismaClient";

export interface UserActivityBackfillBatch {
  /** Início inclusivo do intervalo UTC. */
  from: Date;
  /** Fim exclusivo do intervalo UTC. */
  to: Date;
}

export interface UserActivityBackfillResult extends UserActivityBackfillBatch {
  /** Linhas realmente inseridas; conflitos idempotentes não contam. */
  inserted: number;
}

export interface UserActivityBackfillOptions {
  /** Quantidade de meses históricos, em janelas mensais. */
  months?: number;
  /** Timeout por lote. Cada lote é uma transação independente. */
  timeoutMs?: number;
  /** Callback seguro para progresso; recebe somente janela e contagem. */
  onBatch?: (result: UserActivityBackfillResult) => void | Promise<void>;
}

/**
 * Janelas mensais UTC para o backfill de atividade.
 *
 * Os access_logs são persistidos em UTC sem timezone. Os limites usam o mesmo
 * instante de referência para todos os lotes, evitando gaps/sobreposição entre
 * meses. A última janela é `[now - 1 month, now)`.
 */
export function buildUserActivityBackfillBatches(
  anchor: Date,
  months = 6,
): UserActivityBackfillBatch[] {
  if (!Number.isInteger(months) || months < 1 || months > 12) {
    throw new Error("months must be an integer between 1 and 12");
  }

  const batches: UserActivityBackfillBatch[] = [];
  for (let offset = months; offset >= 1; offset -= 1) {
    batches.push({
      from: addUtcMonths(anchor, -offset),
      to: addUtcMonths(anchor, -(offset - 1)),
    });
  }
  return batches;
}

/**
 * Backfill idempotente de `user_activity_daily` para até seis meses.
 *
 * Cada janela mensal roda em uma transação própria: um lote com falha não
 * mantém lock nas tabelas e o comando pode ser repetido com segurança. A
 * consulta separa o join por `userId` do fallback por e-mail normalizado;
 * isso evita o plano patológico do `OR` entre joins incompatíveis.
 */
export async function backfillUserActivityDaily(
  anchor: Date = new Date(),
  options: UserActivityBackfillOptions = {},
): Promise<UserActivityBackfillResult[]> {
  const months = options.months ?? 6;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const batches = buildUserActivityBackfillBatches(anchor, months);
  const results: UserActivityBackfillResult[] = [];

  for (const batch of batches) {
    const inserted = await prisma.$transaction(
      async (tx) =>
        tx.$executeRaw`
          INSERT INTO "user_activity_daily" ("day", "userId")
          SELECT DISTINCT
            (((events."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date),
            events."userId"
          FROM (
            SELECT al."createdAt", u."id" AS "userId"
            FROM "access_logs" al
            JOIN "users" u ON u."id" = al."userId"
            WHERE al."userId" IS NOT NULL
              AND al."success" = true
              AND al."action" IN ('LOGIN', 'GOOGLE_LOGIN', 'REFRESH')
              AND al."createdAt" >= ${batch.from}
              AND al."createdAt" < ${batch.to}

            UNION ALL

            SELECT al."createdAt", u."id" AS "userId"
            FROM "access_logs" al
            JOIN "users" u ON lower(u."email") = lower(al."email")
            WHERE al."userId" IS NULL
              AND al."action" = 'LOGIN'
              AND al."success" = true
              AND al."createdAt" >= ${batch.from}
              AND al."createdAt" < ${batch.to}
          ) events
          ON CONFLICT ("day", "userId") DO NOTHING
        `,
      { timeout: timeoutMs, maxWait: Math.min(timeoutMs, 10_000) },
    );

    const result = { ...batch, inserted };
    results.push(result);
    await options.onBatch?.(result);
  }

  return results;
}

/** Add calendar months in UTC while preserving the time-of-day. */
function addUtcMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetMonthStart = new Date(
    Date.UTC(
      year,
      month + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
  const lastDay = new Date(
    Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  targetMonthStart.setUTCDate(Math.min(day, lastDay));
  return targetMonthStart;
}
