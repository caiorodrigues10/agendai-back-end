import { spDayKey } from "../domain/periodWindows";
import { userActivityDedupeKey, USER_ACTIVITY_TTL_SECONDS } from "./trafficKeys";
import { getApiRedisConnection } from "@/shared/infra/queue/redisConnection";
import { prisma } from "@/libs/prismaClient";
import { getModuleLogger } from "@/shared/utils/logger";

const logger = getModuleLogger("traffic:user-activity");

/**
 * One `user_activity_daily` row per user per civil day (America/Sao_Paulo).
 *
 * Called from the session-issuing paths (password login, Google login and
 * token refresh). The Redis `SET NX` marker is the dedupe guard: it keeps
 * the refresh loop (every few minutes per active tab) from issuing an
 * upsert per request — at most one write per user per day.
 *
 * Failure is never fatal: activity accounting is best-effort telemetry and
 * must not break authentication.
 */
export async function recordUserActivity(userId: string | undefined, now: Date = new Date()): Promise<void> {
  if (!userId) return;

  const dayKey = spDayKey(now);
  let dependency: "redis" | "postgres" | "unknown" = "unknown";
  try {
    const client = getApiRedisConnection();
    dependency = "redis";
    // SET NX: only the first request of the day proceeds to the upsert.
    const firstOfToday = await client.set(
      userActivityDedupeKey(dayKey, userId),
      "1",
      "EX",
      USER_ACTIVITY_TTL_SECONDS,
      "NX",
    );
    if (firstOfToday !== "OK") return;

    dependency = "postgres";
    await prisma.userActivityDaily.upsert({
      where: { day_userId: { day: dayKeyToDate(dayKey), userId } },
      create: { day: dayKeyToDate(dayKey), userId },
      // Nothing to update — an existing day/user row is never rewritten.
      update: {},
    });
  } catch (error) {
    // Best-effort: drop the dedupe marker so a later attempt can retry the same
    // civil day. If Redis is unavailable, the marker expires and a later
    // successful authentication can still fill the missing day.
    logger.warn(
      {
        dependency,
        errorType: error instanceof Error ? error.name : "UnknownError",
        errorCode: safeErrorCode(error),
      },
      "failed to record daily user activity",
    );
    try {
      await getApiRedisConnection().del(userActivityDedupeKey(dayKey, userId));
    } catch {
      /* marker expiry will retry naturally */
    }
  }
}

/**
 * Keep only a short, non-personal error identifier in logs.
 *
 * The raw Prisma/Redis message may contain connection details and is not
 * needed to distinguish the two dependencies. User id, email, IP, user-agent
 * and token are never passed to this logger.
 */
function safeErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown })?.code;
  if (typeof code !== "string") return undefined;
  return /^[A-Z0-9_.-]{1,64}$/.test(code) ? code : undefined;
}

/** `YYYY-MM-DD` → UTC-midnight Date (the `@db.Date` round-trip). */
function dayKeyToDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}
