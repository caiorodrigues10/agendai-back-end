import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mocka o node-cron ANTES de importar o módulo sob teste.
vi.mock("node-cron", () => {
  const cron = { schedule: vi.fn() };
  return { default: cron };
});

// Mocka o SendAppointmentRemindersUseCase para podermos espiar/spy execute().
vi.mock("@/modules/appointments/useCases/appointmentUseCases", () => ({
  SendAppointmentRemindersUseCase: class {
    execute = vi.fn();
  },
}));

import cron from "node-cron";
import { container } from "tsyringe";
import { scheduleAppointmentReminders } from "./appointmentReminders.cron";

describe("scheduleAppointmentReminders", () => {
  const log = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registra cron.schedule com timezone America/Sao_Paulo e expressão 0 8 * * *", () => {
    scheduleAppointmentReminders(log);

    expect(cron.schedule).toHaveBeenCalledTimes(1);
    const args = (cron.schedule as any).mock.calls[0];
    expect(args[0]).toBe("0 8 * * *");
    expect(args[2]).toEqual({ timezone: "America/Sao_Paulo" });
    expect(typeof args[1]).toBe("function");

    // Confirma que o log de "agendado" foi emitido.
    expect(log.info).toHaveBeenCalledWith(
      { schedule: "0 8 * * *", timezone: "America/Sao_Paulo" },
      "Cron de lembretes de agendamento agendado"
    );
  });

  it("erro lançado pelo use case é capturado e logado, sem propagar", async () => {
    const useCase = {
      execute: vi.fn().mockRejectedValue(new Error("boom")),
    };
    vi.spyOn(container, "resolve").mockReturnValue(useCase as any);

    scheduleAppointmentReminders(log);

    // Pega a função handler passada ao cron.schedule e executa.
    const handler = (cron.schedule as any).mock.calls[0][1];
    // Não deve rejeitar — deve tratar internamente.
    await expect(handler()).resolves.toBeUndefined();

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Falha ao rodar cron de lembretes de agendamento"
    );
  });

  it("em sucesso, loga o resultado sem chamar log.error", async () => {
    const result = { sent: 3, failed: 0 };
    const useCase = { execute: vi.fn().mockResolvedValue(result) };
    vi.spyOn(container, "resolve").mockReturnValue(useCase as any);

    scheduleAppointmentReminders(log);

    const handler = (cron.schedule as any).mock.calls[0][1];
    await expect(handler()).resolves.toBeUndefined();

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith(
      result,
      "Lembretes de agendamento do dia enviados"
    );
    expect(log.error).not.toHaveBeenCalled();
  });
});
