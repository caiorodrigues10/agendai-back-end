/// <reference types="vitest/globals" />
import {
  buildLateClientMessage,
  buildLateStaffMessage,
  civilDayOfWeek,
  civilInstantInTimezone,
  lateAlertDedupKey,
  resolveLateAlertLevel,
} from "./lateAlerts";

const SP = "America/Sao_Paulo"; // UTC-3 fixo (sem DST desde 2019)

describe("civilInstantInTimezone", () => {
  it("converte horário civil de SP para o instante UTC correto", () => {
    const at = civilInstantInTimezone(2026, 10, 5, 19, 30, SP);
    expect(at.toISOString()).toBe("2026-10-05T22:30:00.000Z");
  });

  it("respeita outro fuso (ex.: Manaus UTC-4)", () => {
    const at = civilInstantInTimezone(2026, 10, 5, 19, 30, "America/Manaus");
    expect(at.toISOString()).toBe("2026-10-05T23:30:00.000Z");
  });
});

describe("civilDayOfWeek", () => {
  it("segunda-feira de uma data civil conhecida", () => {
    expect(civilDayOfWeek(2026, 10, 5)).toBe(1); // 2026-10-05 é segunda
  });
});

describe("resolveLateAlertLevel", () => {
  const tolerance = 15;
  // Horário marcado: 19:00 SP = 22:00 UTC; fechamento: 20:30 SP = 23:30 UTC.
  const appointmentAt = civilInstantInTimezone(2026, 10, 5, 19, 0, SP);
  const closeAt = civilInstantInTimezone(2026, 10, 5, 20, 30, SP);
  const at = (hh: number, mm: number) => civilInstantInTimezone(2026, 10, 5, hh, mm, SP);

  it("antes do horário → 0", () => {
    expect(resolveLateAlertLevel({ now: at(18, 59), appointmentAt, toleranceMinutes: tolerance, closeAt })).toBe(0);
  });

  it("dentro da tolerância (14min) → 0; na tolerância (15min) → L1", () => {
    expect(resolveLateAlertLevel({ now: at(19, 14), appointmentAt, toleranceMinutes: tolerance, closeAt: null })).toBe(0);
    expect(resolveLateAlertLevel({ now: at(19, 15), appointmentAt, toleranceMinutes: tolerance, closeAt: null })).toBe(1);
  });

  it("29min → ainda L1; 30min → L2", () => {
    expect(resolveLateAlertLevel({ now: at(19, 29), appointmentAt, toleranceMinutes: tolerance, closeAt: null })).toBe(1);
    expect(resolveLateAlertLevel({ now: at(19, 30), appointmentAt, toleranceMinutes: tolerance, closeAt: null })).toBe(2);
  });

  it("modo impaciente (60min antes de fechar) antecipa L1/L2 para 10/25", () => {
    // now = 20:00, falta 30min pras 20:30 → impaciente; atraso de 60min.
    // Com thresholds 10/25, 60min de atraso estoura L2 — mas quero medir a ANTECIPAÇÃO:
    const appt20 = civilInstantInTimezone(2026, 10, 5, 20, 0, SP);
    expect(resolveLateAlertLevel({ now: at(20, 10), appointmentAt: appt20, toleranceMinutes: tolerance, closeAt })).toBe(1); // 10min = L1 impaciente (normal seria 0)
    expect(resolveLateAlertLevel({ now: at(20, 25), appointmentAt: appt20, toleranceMinutes: tolerance, closeAt })).toBe(2); // 25min = L2 impaciente
  });

  it("sem janela impaciente, a tolerância 15 vale normal mesmo com closeAt no futuro distante", () => {
    const closeFar = civilInstantInTimezone(2026, 10, 5, 23, 0, SP); // fecha só às 23h
    expect(resolveLateAlertLevel({ now: at(19, 14), appointmentAt, toleranceMinutes: tolerance, closeAt: closeFar })).toBe(0);
  });

  it("após o fechamento, dentro da graça, agendamento anterior vira L3", () => {
    expect(resolveLateAlertLevel({ now: at(20, 30), appointmentAt, toleranceMinutes: tolerance, closeAt })).toBe(3);
    expect(resolveLateAlertLevel({ now: at(21, 0), appointmentAt, toleranceMinutes: tolerance, closeAt })).toBe(3); // exatamente 30min
  });

  it("passada a graça de 30min pós-fecho → silêncio (0)", () => {
    expect(resolveLateAlertLevel({ now: at(21, 1), appointmentAt, toleranceMinutes: tolerance, closeAt })).toBe(0);
  });

  it("salão fechado (sem schedule) → sem impaciência e sem L3", () => {
    expect(resolveLateAlertLevel({ now: at(19, 40), appointmentAt, toleranceMinutes: tolerance, closeAt: null })).toBe(2);
  });
});

describe("dedup keys", () => {
  it("uma chave por nível por agendamento", () => {
    expect(lateAlertDedupKey(1, "appt-1")).toBe("late1:appt-1");
    expect(lateAlertDedupKey(2, "appt-1")).toBe("late2:appt-1");
    expect(lateAlertDedupKey(3, "appt-1")).toBe("late3:appt-1");
  });
});

describe("mensagens", () => {
  const base = {
    customerName: "Ana",
    shopName: "Studio Bela",
    serviceName: "Corte",
    scheduledTime: "19:00",
    lateMinutes: 16,
    closeTime: "20:30",
    manageUrl: "https://app.example.com/agendamento/gerenciar?token=abc",
  };

  it("L1 normal: cordial, sem link nem ameaça de fechamento", () => {
    const msg = buildLateClientMessage(1, base, false);
    expect(msg).toContain("atraso");
    expect(msg).toContain("19:00");
    expect(msg).not.toContain("20:30");
    expect(msg).not.toContain("remarque");
  });

  it("L1 impaciente: curto, cita fechamento, sem link", () => {
    const msg = buildLateClientMessage(1, base, true);
    expect(msg).toContain("fecha às *20:30*");
    expect(msg).not.toContain("remarque em um toque");
  });

  it("L2 impaciente: minutos de atraso + ultimato de fechamento, sem link", () => {
    const urgent = { ...base, lateMinutes: 26 };
    const msg = buildLateClientMessage(2, urgent, true);
    expect(msg).toContain("26 min");
    expect(msg).toContain("*20:30*");
    expect(msg).not.toContain("https://");
  });

  it("L3: fechamento + link de remarcação", () => {
    const msg = buildLateClientMessage(3, base, false);
    expect(msg).toContain("fechar o expediente");
    expect(msg).toContain(base.manageUrl!);
  });

  it("mensagem do salão menciona nome/horário e orienta ação manual", () => {
    const msg = buildLateStaffMessage(2, base);
    expect(msg).toContain("Ana");
    expect(msg).toContain("19:00");
    expect(msg).toContain("NO_SHOW");
  });
});
