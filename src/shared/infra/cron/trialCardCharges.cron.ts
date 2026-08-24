import cron from "node-cron";
import { container } from "tsyringe";
import { ChargeTrialEndedSubscriptionsUseCase } from "@/modules/subscriptions/useCases/chargeTrialEnded/ChargeTrialEndedSubscriptionsUseCase";

type CronLogger = {
  info: (obj: object | string, msg?: string) => void;
  error: (obj: object | string, msg?: string) => void;
  warn?: (obj: object | string, msg?: string) => void;
};

/**
 * Cobra cartões vaulted após o fim do trial (diário 09:00 America/Sao_Paulo).
 */
export function scheduleTrialCardCharges(log: CronLogger): void {
  try {
    cron.schedule(
      "0 9 * * *",
      async () => {
        try {
          const useCase = container.resolve(ChargeTrialEndedSubscriptionsUseCase);
          const result = await useCase.execute();
          log.info(result, "Cobrança pós-trial (cartão vaulted) concluída");
        } catch (err) {
          log.error({ err }, "Falha ao rodar cron de cobrança pós-trial");
        }
      },
      { timezone: "America/Sao_Paulo" }
    );
    log.info(
      { schedule: "0 9 * * *", timezone: "America/Sao_Paulo" },
      "Cron de cobrança pós-trial agendado"
    );
  } catch (err) {
    log.error?.({ err }, "Não foi possível agendar cron de cobrança pós-trial");
  }
}
