import cron from "node-cron";
import { container } from "tsyringe";
import { SendAppointmentRemindersUseCase } from "@/modules/appointments/useCases/appointmentUseCases";

type CronLogger = {
  info: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
  warn?: (obj: object | string, msg?: string) => void;
};

/**
 * Agenda o envio diário de lembretes de agendamento via WhatsApp.
 * - 08:00 America/Sao_Paulo
 * - Erros só são logados; nunca derrubam o processo.
 *
 * TODO: este cron dispara em cada réplica do serviço. Hoje o backend roda em
 * instância única (docker-compose sem `replicas`, sem K8s), mas se passar a
 * rodar com múltiplas réplicas (scaling horizontal), usar um lock distribuído
 * (ex.: pg_advisory_xact_lock) para evitar envio duplicado do mesmo lembrete.
 */
export function scheduleAppointmentReminders(log: CronLogger): void {
  try {
    cron.schedule(
      "0 8 * * *",
      async () => {
        try {
          const useCase = container.resolve(SendAppointmentRemindersUseCase);
          const result = await useCase.execute();
          log.info(result, "Lembretes de agendamento do dia enviados");
        } catch (err) {
          log.error(
            { err },
            "Falha ao rodar cron de lembretes de agendamento"
          );
        }
      },
      { timezone: "America/Sao_Paulo" }
    );
    log.info(
      { schedule: "0 8 * * *", timezone: "America/Sao_Paulo" },
      "Cron de lembretes de agendamento agendado"
    );
  } catch (err) {
    log.error?.({ err }, "Não foi possível agendar cron de lembretes");
  }
}
