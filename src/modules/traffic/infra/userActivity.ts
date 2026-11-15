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
  try {
    const client = getApiRedisConnection();
    // SET NX: only the first request of the day proceeds to the upsert.
    const firstOfToday = await client.set(
      userActivityDedupeKey(dayKey, userId),
      "1",
      "EX",
      USER_ACTIVITY_TTL_SECONDS,
      "NX",
    );
    if (firstOfToday !== "OK") return;

    await prisma.userActivityDaily.upsert({
      where: { day_userId: { day: dayKeyToDate(dayKey), userId } },
      create: { day: dayKeyToDate(dayKey), userId },
      // Nothing to update — the row is the presence marker itself.
      update: {},
    });
  } catch (error) {
    // Best-effort: drop the dedupe marker so a later attempt can retry.
    logger.warn(
      { err: (error as Error)?.message },
      "failed to record daily user activity",
    );
    try {
      await getApiRedisConnection().del(userActivityDedupeKey(dayKey, userId));
    } catch {
      /* marker expiry will retry naturally */
    }
  }
}

/** `YYYY-MM-DD` → UTC-midnight Date (the `@db.Date` round-trip). */
function dayKeyToDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}
