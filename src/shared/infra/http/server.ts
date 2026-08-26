import "reflect-metadata";
import "tsconfig-paths/register";
import "@/shared/container";
import authConfig from "@/config/auth";
import { buildApp } from "./app";
import { scheduleAppointmentReminders } from "@/shared/infra/cron/appointmentReminders.cron";
import { schedulePostPublisher } from "@/shared/infra/cron/postPublisher.cron";
import { scheduleTrialCardCharges } from "@/shared/infra/cron/trialCardCharges.cron";
import { scheduleCleanOldLogs } from "@/shared/infra/cron/cleanOldLogs.cron";
import {
  stopWhatsAppWorker,
  stopEmailWorker,
} from "@/shared/infra/queue";
import { initSentry } from "@/shared/utils/sentry";
import { initTracing } from "@/shared/utils/tracing";
import { logger, getModuleLogger } from "@/shared/utils/logger";

initSentry();
const tracing = initTracing();

// Trigger auth config validation (throws on startup if secrets not set)
void authConfig;

const port = Number(process.env.PORT || 3333);
const serverLogger = getModuleLogger('server');

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port, host: "0.0.0.0" });
    serverLogger.info({ port }, 'Server started');

    // Cron de lembretes: falha ao agendar não derruba o servidor
    try {
      scheduleAppointmentReminders(app.log);
    } catch (err) {
      serverLogger.error({ err }, "Falha ao iniciar cron de lembretes de agendamento");
    }

    // Cron de publicação de posts (agendados + auto-post de abertura)
    try {
      schedulePostPublisher(app.log);
    } catch (err) {
      serverLogger.error({ err }, "Falha ao iniciar cron de publicação de posts");
    }

    // Cron de cobrança pós-trial (cartão vaulted Asaas)
    try {
      scheduleTrialCardCharges(app.log);
    } catch (err) {
      serverLogger.error({ err }, "Falha ao iniciar cron de cobrança pós-trial");
    }

    // Cron de limpeza de logs (LGPD — 6 meses retenção)
    try {
      scheduleCleanOldLogs(app.log);
    } catch (err) {
      serverLogger.error({ err }, "Falha ao iniciar cron de limpeza de logs");
    }

    // Graceful shutdown
    const shutdown = async () => {
      serverLogger.info("Shutting down...");
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

start();