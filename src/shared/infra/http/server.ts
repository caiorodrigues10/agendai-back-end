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
import {
  stopWhatsAppWorker,
  stopEmailWorker,
} from "@/shared/infra/queue";
import { cleanupTimers as cleanupBruteForceTimers } from "@/shared/services/bruteForceProtection";
import { initSentry } from "@/shared/utils/sentry";
import { initTracing } from "@/shared/utils/tracing";
import { logger, getModuleLogger } from "@/shared/utils/logger";
import { shouldRunCrons, shouldRunWorkers, shouldRunApi } from "@/shared/config/processRole";

initSentry();
const tracing = initTracing();

// Trigger auth config validation (throws on startup if secrets not set)
void authConfig;

const port = Number(process.env.PORT || 3333);
const serverLogger = getModuleLogger('server');

async function start() {
  const role = process.env.PROCESS_ROLE || 'all';
  serverLogger.info({ role }, 'Starting with process role');

  if (!shouldRunApi()) {
    serverLogger.info('Skipping API server (not api/all role)');
    startWorkersOnly();
    return;
  }

    const app = await buildApp();
    try {
      await app.listen({ port, host: "0.0.0.0" });
      serverLogger.info({ port }, 'Server started');

      // Crons — only run when PROCESS_ROLE is 'all' or 'scheduler'
    if (shouldRunCrons()) {
      try {
        scheduleAppointmentReminders(app.log);
      } catch (err) {
        serverLogger.error({ err }, "Falha ao iniciar cron de lembretes de agendamento");
      }

      try {
        schedulePostPublisher(app.log);
      } catch (err) {
        serverLogger.error({ err }, "Falha ao iniciar cron de publicação de posts");
      }

      try {
        scheduleTrialCardCharges(app.log);
      } catch (err) {
        serverLogger.error({ err }, "Falha ao iniciar cron de cobrança pós-trial");
      }

      try {
        scheduleCleanOldLogs(app.log);
      } catch (err) {
        serverLogger.error({ err }, "Falha ao iniciar cron de limpeza de logs");
      }

      try {
        scheduleDailyWeatherLog(app.log);
      } catch (err) {
        serverLogger.error({ err }, "Falha ao iniciar cron de daily weather log");
      }
    }

    // Graceful shutdown
    const shutdown = async () => {
      serverLogger.info("Shutting down...");
      cleanupBruteForceTimers();
      await stopEmailWorker().catch((err) => serverLogger.error({ err }, 'Failed to stop email worker'));
      await stopWhatsAppWorker();
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
 * Worker-only mode: no HTTP server, just queues.
 * Used when PROCESS_ROLE=worker.
 */
async function startWorkersOnly() {
  serverLogger.info('Starting in worker-only mode (no HTTP)');

  // Workers are started by the queue barrel on import.
  // We just keep the process alive and handle shutdown.
  const shutdown = async () => {
    serverLogger.info("Shutting down worker...");
    await stopEmailWorker().catch((err) => serverLogger.error({ err }, 'Failed to stop email worker'));
    await stopWhatsAppWorker();
    if (tracing) {
      await tracing.shutdown();
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start();
