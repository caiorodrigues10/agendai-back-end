import "reflect-metadata";
import "tsconfig-paths/register";
import { shutdownTracing } from "@/shared/utils/telemetryBootstrap";
import { env } from "@/config/env";
import "@/shared/container";
import authConfig from "@/config/auth";
import { buildApp } from "./app";
import type { FastifyInstance } from "fastify";
import { getTasks as listCronTasks } from "node-cron";
import { prisma } from "@/libs/prismaClient";
import { realtimeHub } from "@/shared/services/realtimeService";
import { closeRedisConnections } from "@/shared/infra/queue/redisConnection";
import { stopPostBroadcastWorker } from "@/shared/infra/queue/postBroadcastWorker";
import { closePostRenderPool } from "@/shared/infra/worker/postRenderPool";
import { scheduleAppointmentReminders } from "@/shared/infra/cron/appointmentReminders.cron";
import { schedulePostPublisher } from "@/shared/infra/cron/postPublisher.cron";
import { scheduleEmailReminders } from "@/shared/infra/cron/emailReminders.cron";
import { scheduleTrialCardCharges } from "@/shared/infra/cron/trialCardCharges.cron";
import { scheduleCleanOldLogs } from "@/shared/infra/cron/cleanOldLogs.cron";
import { scheduleDailyWeatherLog } from "@/shared/infra/cron/dailyWeatherLog.cron";
import { scheduleCleanupExpiredPix } from "@/shared/infra/cron/cleanupExpiredPix.cron";
import { scheduleRefundReconciliation } from "@/shared/infra/cron/refundReconciliation.cron";
import { scheduleDepositExpiration } from "@/modules/deposits/jobs/depositExpirationJob";
import { scheduleWaitlistExpiration } from "@/modules/waitlist/jobs/waitlistExpirationJob";
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
import { logger, getModuleLogger, withCorrelationLogs } from "@/shared/utils/logger";
import { shouldRunCrons, shouldRunWorkers, shouldRunApi } from "@/shared/config/processRole";
import { startProcessHeartbeats, stopProcessHeartbeats } from "@/shared/infra/queue/processHeartbeat";

initSentry();

// Trigger auth config validation (throws on startup if secrets not set)
void authConfig;

const port = env.port;
const serverLogger = getModuleLogger('server');

/** Folga além da drenagem antes de forçar a saída — abaixo do stop_grace_period (30s). */
const FORCE_EXIT_EXTRA_MS = 4_000;

const WORKER_STOPS: Array<[string, () => Promise<void>]> = [
  ['email worker', stopEmailWorker],
  ['whatsapp worker', stopWhatsAppWorker],
  ['notification worker', stopNotificationWorker],
  ['post-broadcast worker', stopPostBroadcastWorker],
];

let shuttingDown = false;

/**
 * Storage warm-up: tenta um probe leve no GCS para detectar se está
 * funcional ou indisponível (billing desativado, sem credenciais, etc.)
 * e loga UMA mensagem clara sobre qual provedor está efetivamente ativo.
 */
async function probeStorageProviders(log: typeof serverLogger): Promise<void> {
  try {
    const { GcsStorageProvider } = await import(
      "@/shared/container/providers/StorageProvider/implementations/GcsStorageProvider"
    )
    // Verifica se GCS tem credenciais configuradas (sem fazer chamada de rede)
    const hasGcsConfig = Boolean(
      process.env.GCS_KEY_FILE_PATH ||
      process.env.GCS_CREDENTIALS_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    )

    if (!hasGcsConfig) {
      log.warn(
        "[Storage] GCS sem credenciais configuradas — Cloudinary é o provedor efetivo de uploads."
      )
      return
    }

    // Credenciais existem — tenta um probe real (list objects no bucket com maxResults=1)
    const gcs = new GcsStorageProvider()
    try {
      // Força lazy init do storage + bucket
      const bucket = (gcs as any).bucket
      await bucket.getFiles({ maxResults: 1 })
      log.info(
        "[Storage] GCS conectado com sucesso — provedor primário de uploads."
      )
    } catch (probeErr: any) {
      const msg = probeErr?.errors?.[0]?.message ?? probeErr?.message ?? String(probeErr)
      log.warn(
        { err: probeErr },
        `[Storage] GCS indisponível (${msg}) — operando com Cloudinary como provedor primário de fato. ` +
        `Se reativar o billing do GCP, o sistema voltará a usar GCS automaticamente.`
      )
    }
  } catch {
    // Import falhou — ignora silenciosamente
  }
}

async function runStep(step: string, action: () => unknown | Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (err) {
    serverLogger.error({ err, step }, 'Shutdown: etapa falhou');
  }
}

function stopCrons(): void {
  for (const task of listCronTasks().values()) {
    void Promise.resolve(task.stop()).catch((err) =>
      serverLogger.error({ err }, 'Shutdown: falha ao parar cron'),
    );
  }
}

async function drainWorkers(deadlineMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, deadlineMs);
    timer.unref?.();
  });

  await Promise.race([
    Promise.all(
      WORKER_STOPS.map(async ([worker, stop]) => {
        try {
          await stop();
        } catch (err) {
          serverLogger.error({ err, worker }, 'Shutdown: falha ao parar worker');
        }
      }),
    ),
    deadline,
  ]);
  if (timer) clearTimeout(timer);
}

/**
 * Sequência de shutdown:
 * 1. parar de aceitar novos trabalhos (timers/heartbeats);
 * 2. suspender scheduler (crons) e dispatcher;
 * 3. drenar requests e jobs dentro de SHUTDOWN_DRAIN_TIMEOUT_MS
 *    (Fastify e BullMQ fundem "parar de aceitar" e "drenar" em close());
 * 4. liberar conexões de banco, Redis e realtime, e encerrar o pool de
 *    render de posts (worker threads);
 * 5. encerrar instrumentação.
 * Cada etapa tem try/catch próprio — a falha de uma não impede as demais.
 */
async function shutdown(app?: FastifyInstance): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  serverLogger.info("Shutting down...");

  const drainMs = env.shutdownDrainTimeoutMs;
  const forceTimer = setTimeout(() => {
    serverLogger.error({ drainMs }, 'Shutdown excedeu o prazo máximo — encerrando processo');
    process.exit(1);
  }, drainMs + FORCE_EXIT_EXTRA_MS);
  forceTimer.unref?.();

  await runStep('parar heartbeats', stopProcessHeartbeats);
  await runStep('parar timers de brute-force', cleanupBruteForceTimers);

  await runStep('parar crons', stopCrons);
  await runStep('parar dispatcher de notificações', stopNotificationDispatcher);

  if (app) {
    await runStep('drenar servidor HTTP', () => app.close());
  }
  await runStep('drenar workers', () => drainWorkers(drainMs));
  await runStep('fechar pool de render de posts', closePostRenderPool);

  await runStep('fechar fila de notificações', closeNotificationQueue);
  await runStep('fechar realtime', () => realtimeHub.stop());
  await runStep('fechar conexões Redis', closeRedisConnections);
  await runStep('desconectar Prisma', () => prisma.$disconnect());

  await runStep('encerrar tracing', shutdownTracing);

  clearTimeout(forceTimer);
  process.exit(0);
}

function signalHandler(app?: FastifyInstance): () => void {
  return () => {
    if (shuttingDown) {
      serverLogger.warn('Sinal recebido durante o shutdown — forçando saída');
      process.exit(0);
    }
    void shutdown(app);
  };
}

async function start() {
  const role = env.processRole;
  serverLogger.info({ role }, 'Starting with process role');
  await startProcessHeartbeats(role);

  if (shouldRunWorkers(role)) {
    await startEmailWorker();
    await startWhatsAppWorker();
    await startNotificationWorker();
    await startNotificationDispatcher();
  }

  if (!shouldRunApi(role)) {
    serverLogger.info('Skipping API server (not api/all role)');
    if (shouldRunCrons(role)) registerCrons(serverLogger);
    startBackgroundOnly();
    return;
  }

    const app = await buildApp();
    try {
      await app.listen({ port, host: "0.0.0.0" });
      serverLogger.info({ port }, 'Server started');

    // Storage warm-up: loga UMA vez qual provedor está efetivamente ativo
    probeStorageProviders(serverLogger);

    if (shouldRunCrons(role)) {
      registerCrons(withCorrelationLogs(app.log));
    }

    process.on("SIGINT", signalHandler(app));
    process.on("SIGTERM", signalHandler(app));
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
  process.on("SIGINT", signalHandler());
  process.on("SIGTERM", signalHandler());
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
    ['expiração de depósitos', () => scheduleDepositExpiration(log)],
    ['expiração de waitlist', () => scheduleWaitlistExpiration(log)],
    ['e-mails de lembrete', () => scheduleEmailReminders()],
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
