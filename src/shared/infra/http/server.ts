import "reflect-metadata";
import "tsconfig-paths/register";
import "@/shared/container";
import { buildApp } from "./app";
import { scheduleAppointmentReminders } from "@/shared/infra/cron/appointmentReminders.cron";
import { schedulePostPublisher } from "@/shared/infra/cron/postPublisher.cron";
import { scheduleTrialCardCharges } from "@/shared/infra/cron/trialCardCharges.cron";
import {
  startWhatsAppWorker,
  stopWhatsAppWorker,
  startEmailWorker,
  stopEmailWorker,
} from "@/shared/infra/queue";

const port = Number(process.env.PORT || 3333);

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`Server running at http://localhost:${port}`);

    // WhatsApp worker (BullMQ)
    try {
      await startWhatsAppWorker();
    } catch (err) {
      app.log.error({ err }, "Falha ao iniciar WhatsApp worker (Redis disponível?)");
    }

    // Email worker (BullMQ)
    try {
      await startEmailWorker();
    } catch (err) {
      app.log.error({ err }, "Falha ao iniciar Email worker (Redis disponível?)");
    }

    // Cron de lembretes: falha ao agendar não derruba o servidor
    try {
      scheduleAppointmentReminders(app.log);
    } catch (err) {
      app.log.error({ err }, "Falha ao iniciar cron de lembretes de agendamento");
    }

    // Cron de publicação de posts (agendados + auto-post de abertura)
    try {
      schedulePostPublisher(app.log);
    } catch (err) {
      app.log.error({ err }, "Falha ao iniciar cron de publicação de posts");
    }

    // Cron de cobrança pós-trial (cartão vaulted Asaas)
    try {
      scheduleTrialCardCharges(app.log);
    } catch (err) {
      app.log.error({ err }, "Falha ao iniciar cron de cobrança pós-trial");
    }

    // Graceful shutdown
    const shutdown = async () => {
      console.log("Shutting down...");
      await stopEmailWorker().catch(() => {});
      await stopWhatsAppWorker();
      await app.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
