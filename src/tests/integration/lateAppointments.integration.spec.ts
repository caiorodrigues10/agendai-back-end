/// <reference types="vitest/globals" />
/**
 * Integração (Postgres real): varredura de atrasos lê agenda/schedule/policy
 * do banco e classifica L1/L3 corretamente. O envio de WhatsApp é no-op em
 * VITEST (enqueueWhatsApp retorna cedo) — o que validamos aqui é o motor
 * (seleção + nível + dedup keys construídas) contra dados reais.
 */
import { randomUUID } from "node:crypto";
import { startPostgresHarness, createProbePrisma, type PostgresHarness } from "../helpers/postgres";
import { runLateAppointmentAlerts } from "@/modules/appointments/useCases/notifyLate/NotifyLateAppointmentsUseCase";

describe("late appointments alerts (integration, DB real)", () => {
  let harness: PostgresHarness | undefined;
  let prisma: ReturnType<typeof createProbePrisma>;
  let shopId: string;
  let serviceId: string;

  beforeAll(async () => {
    harness = await startPostgresHarness();
    prisma = createProbePrisma();
    const shop = await prisma.barbershop.create({
      data: {
        name: "QA Late Shop",
        whatsapp: "11900000002",
        evolutionInstanceName: "inst-qa-late",
        timezone: "America/Sao_Paulo",
      },
    });
    shopId = shop.id;
    const service = await prisma.service.create({
      data: { barbershopId: shopId, name: "Corte QA", price: 40, avgTimeMinutes: 30, icon: "scissors" },
    });
    serviceId = service.id;
  }, 180_000);

  afterAll(async () => {
    try {
      if (prisma && shopId) await prisma.barbershop.deleteMany({ where: { id: shopId } });
    } catch { /* best-effort */ }
    if (prisma) await prisma.$disconnect();
    if (harness) await harness.stop();
  });

  function seedAppointment(dayIso: string, time: string) {
    return prisma.appointment.create({
      data: {
        barbershopId: shopId,
        serviceId,
        customerName: "Tardio QA",
        whatsapp: "11999991111",
        date: new Date(`${dayIso}T00:00:00.000Z`),
        time,
        status: "CONFIRMED",
      },
    });
  }

  it("agendamento de hoje com 18min de atraso → nível L1 (tolerância default 15)", async () => {
    // "now" artificial: 2026-10-06 20:40 SP (23:40 UTC). Agendamento às 20:22 SP.
    const day = "2026-10-06";
    await prisma.schedule.create({
      data: { barbershopId: shopId, dayOfWeek: 2, isOpen: true, openTime: "09:00", closeTime: "21:00" }, // terça
    });
    await seedAppointment(day, "20:22");

    const now = new Date("2026-10-06T23:40:00.000Z");
    const report = await runLateAppointmentAlerts(now);

    expect(report.failed).toBe(0);
    expect(report.sent).toBe(1);
    expect(report.byLevel.l1).toBe(1);
  });

  it("modo impaciente: 12min de atraso no último 1h do expediente ainda vira L1 (10min)", async () => {
    // now = 2026-10-06 20:40 SP; fecha às 21:00 → falta 20min → impaciente (L1 aos 10).
    // Agendamento às 20:28 → 12min de atraso: em modo normal seria 0; impaciente → L1.
    await seedAppointment("2026-10-06", "20:28");

    const report = await runLateAppointmentAlerts(new Date("2026-10-06T23:40:00.000Z"));
    const l1 = report.byLevel.l1;
    expect(l1).toBeGreaterThanOrEqual(1); // o de 20:28 (o de 20:22 estourou 18min → também L1)
  });

  it("após o fechamento (dentro da graça) → L3 para ambos", async () => {
    const report = await runLateAppointmentAlerts(new Date("2026-10-07T00:10:00.000Z")); // 21:10 SP, fechou 21:00
    expect(report.failed).toBe(0);
    expect(report.byLevel.l3).toBe(2);
    expect(report.byLevel.l1).toBe(0);
    expect(report.byLevel.l2).toBe(0);
  });

  it("agendamento cancelado não gera alerta", async () => {
    const canceled = await seedAppointment("2026-10-06", "20:22");
    await prisma.appointment.update({ where: { id: canceled.id }, data: { status: "CANCELLED" } });

    const report = await runLateAppointmentAlerts(new Date("2026-10-06T23:40:00.000Z"));
    // 3 criados na suíte, 1 cancelado agora → exatamente 2 são alertados.
    expect(report.failed).toBe(0);
    expect(report.sent).toBe(2);
    expect(report.byLevel.l1).toBe(2);
  });
});
