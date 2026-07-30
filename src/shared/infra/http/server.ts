import "reflect-metadata";
import "tsconfig-paths/register";
import "@/shared/container";
import { buildApp } from "./app";
import { scheduleAppointmentReminders } from "@/shared/infra/cron/appointmentReminders.cron";

const port = Number(process.env.PORT || 3333);

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port, host: "0.0.0.0" });
    console.log(`Server running at http://localhost:${port}`);

    // Cron de lembretes: falha ao agendar não derruba o servidor
    try {
      scheduleAppointmentReminders(app.log);
    } catch (err) {
      app.log.error({ err }, "Falha ao iniciar cron de lembretes de agendamento");
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
