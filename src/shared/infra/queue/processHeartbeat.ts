import type { ProcessRole } from "@/shared/config/processRole";
import { getModuleLogger } from "@/shared/utils/logger";
import { getRedisConnection } from "./redisConnection";

const logger = getModuleLogger("operations:heartbeat");
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TTL_SECONDS = 45;
const timers = new Map<string, ReturnType<typeof setInterval>>();

export function processHeartbeatKey(role: "worker" | "scheduler"): string {
  return `agendai:operations:heartbeat:${role}`;
}

async function beat(role: "worker" | "scheduler"): Promise<void> {
  await getRedisConnection().set(
    processHeartbeatKey(role),
    new Date().toISOString(),
    "EX",
    HEARTBEAT_TTL_SECONDS,
  );
}

export async function startProcessHeartbeats(role: ProcessRole): Promise<void> {
  const roles: Array<"worker" | "scheduler"> =
    role === "all" ? ["worker", "scheduler"] : role === "worker" || role === "scheduler" ? [role] : [];
  for (const heartbeatRole of roles) {
    if (timers.has(heartbeatRole)) continue;
    await beat(heartbeatRole);
    const timer = setInterval(() => {
      beat(heartbeatRole).catch((error) =>
        logger.warn({ err: error, role: heartbeatRole }, "Falha ao publicar heartbeat"),
      );
    }, HEARTBEAT_INTERVAL_MS);
    timers.set(heartbeatRole, timer);
  }
}

export function stopProcessHeartbeats(): void {
  for (const timer of timers.values()) clearInterval(timer);
  timers.clear();
}

