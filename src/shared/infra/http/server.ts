import "reflect-metadata";
import "tsconfig-paths/register";
import "@/shared/container";
import authConfig from "@/config/auth";
import { buildApp } from "./app";
import { scheduleAppointmentReminders } from "@/shared/infra/cron/appointmentReminders.cron";
import { schedulePostPublisher } from "@/shared/infra/cron/postPublisher.cron";
import { scheduleTrialCardCharges } from "@/shared/infra/cron/trialCardCharges.cron";
import { scheduleCleanOldLogs } from "@/shared/infra/cron/cleanOldLogs.cron";
import { scheduleDailyWeatherLog } from "@/shared/infra/cron/dailyWeatherLog.cron";
import { scheduleCleanupExpiredPix } from "@/shared/infra/cron/cleanupExpiredPix.cron";
import { scheduleRefundReconciliation } from "@/shared/infra/cron/refundReconciliation.cron";
import {
  startWhatsAppWorker,
  startEmailWorker,
  stopWhatsAppWorker,
  stopEmailWorker,
  startNotificationDispatcher,
  startNotificationWorker,
  stopNotificationDispatcher,
  stopNotificationWorker,
  closeNotificationQueue,
} from "@/shared/infra/queue";
import { cleanupTimers as cleanupBruteForceTimers } from "@/shared/services/bruteForceProtection";
import { initSentry } from "@/shared/utils/sentry";
import { initTracing } from "@/shared/utils/tracing";
import { logger, getModuleLogger } from "@/shared/utils/logger";
import { getProcessRole, shouldRunCrons, shouldRunWorkers, shouldRunApi } from "@/shared/config/processRole";
import { startProcessHeartbeats, stopProcessHeartbeats } from "@/shared/infra/queue/processHeartbeat";

initSentry();
const tracing = initTracing();

// Trigger auth config validation (throws on startup if secrets not set)
void authConfig;

const port = Number(process.env.PORT || 3333);
const serverLogger = getModuleLogger('server');

async function start() {
  const role = getProcessRole();
  serverLogger.info({ role }, 'Starting with process role');
  await startProcessHeartbeats(role);

  if (shouldRunWorkers()) {
    await startEmailWorker();
    await startWhatsAppWorker();
    await startNotificationWorker();
    await startNotificationDispatcher();
  }

  if (!shouldRunApi()) {
    serverLogger.info('Skipping API server (not api/all role)');
    if (shouldRunCrons()) registerCrons(serverLogger);
    startBackgroundOnly();
    return;
  }

    const app = await buildApp();
    try {
      await app.listen({ port, host: "0.0.0.0" });
      serverLogger.info({ port }, 'Server started');

    if (shouldRunCrons()) {
      registerCrons(app.log);
    }

    // Graceful shutdown
    const shutdown = async () => {
      serverLogger.info("Shutting down...");
      cleanupBruteForceTimers();
      stopProcessHeartbeats();
      await stopEmailWorker().catch((err) => serverLogger.error({ err }, 'Failed to stop email worker'));
      await stopWhatsAppWorker();
      await stopNotificationDispatcher();
      await stopNotificationWorker();
      await closeNotificationQueue();
      await app.close();
      if (tracing) {
        await tracing.shutdown();
      }
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    serverLogger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

/**
 * Background-only mode: workers and/or scheduler, without HTTP.
 */
function startBackgroundOnly() {
  serverLogger.info('Starting background-only mode (no HTTP)');

  // Workers are started by the queue barrel on import.
  // We just keep the process alive and handle shutdown.
  const shutdown = async () => {
    serverLogger.info("Shutting down worker...");
    stopProcessHeartbeats();
    await stopEmailWorker().catch((err) => serverLogger.error({ err }, 'Failed to stop email worker'));
    await stopWhatsAppWorker();
    await stopNotificationDispatcher();
    await stopNotificationWorker();
    await closeNotificationQueue();
    if (tracing) {
      await tracing.shutdown();
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

type CronLog = {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

function registerCrons(log: CronLog): void {
  const jobs = [
    ['lembretes de agendamento', () => scheduleAppointmentReminders(log)],
    ['publicação de posts', () => schedulePostPublisher(log)],
    ['cobrança pós-trial', () => scheduleTrialCardCharges(log)],
    ['limpeza de logs', () => scheduleCleanOldLogs(log)],
    ['daily weather log', () => scheduleDailyWeatherLog(log)],
    ['limpeza de QR Codes PIX', () => scheduleCleanupExpiredPix(log)],
    ['reconciliação de estornos', () => scheduleRefundReconciliation(log)],
  ] as const;

  for (const [name, startJob] of jobs) {
    try {
      startJob();
    } catch (err) {
      serverLogger.error({ err }, `Falha ao iniciar cron de ${name}`);
    }
  }
}

start();
