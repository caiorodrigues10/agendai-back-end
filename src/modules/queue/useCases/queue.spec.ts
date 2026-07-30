import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MockQueueRepository } from "@/modules/queue/infra/repositories/mocks/MockQueueRepository";
import { MockAppointmentRepository } from "@/modules/appointments/infra/repositories/mocks/MockAppointmentRepository";
import { MockBarbershopRepository } from "@/modules/barbershops/infra/repositories/mocks/MockBarbershopRepository";
import { JoinQueueUseCase } from "./joinQueue/JoinQueueUseCase";
import { ListQueueUseCase } from "./listQueue/ListQueueUseCase";
import { UpdateQueueItemUseCase } from "./updateQueueItem/UpdateQueueItemUseCase";
import { DeleteQueueItemUseCase } from "./deleteQueueItem/DeleteQueueItemUseCase";
import { NotifyQueuePositionUpdatesUseCase } from "./notifyQueuePositionUpdates/NotifyQueuePositionUpdatesUseCase";
import { GetQueueWaitEstimateUseCase } from "./getQueueWaitEstimate/GetQueueWaitEstimateUseCase";
import {
  buildReminderMessage,
  buildQueueUpdateMessage,
  CreateAppointmentUseCase,
  SendAppointmentRemindersUseCase,
} from "@/modules/appointments/useCases/appointmentUseCases";
import * as whatsapp from "@/shared/services/whatsappNotificationService";
import { AppError } from "@/shared/errors/AppError";

let queues: MockQueueRepository;
let join: JoinQueueUseCase;
let list: ListQueueUseCase;
let update: UpdateQueueItemUseCase;
let del: DeleteQueueItemUseCase;
let notifyPosition: NotifyQueuePositionUpdatesUseCase;
let notifySpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  queues = new MockQueueRepository();
  notifySpy = vi.fn().mockResolvedValue({ notified: 0, failed: 0 });
  notifyPosition = { execute: notifySpy } as any;
  join = new JoinQueueUseCase(queues as any);
  list = new ListQueueUseCase(queues as any);
  update = new UpdateQueueItemUseCase(queues as any, notifyPosition);
  del = new DeleteQueueItemUseCase(queues as any, notifyPosition);
});

describe("Queue module", () => {
  it("join queue e lista por barbearia", async () => {
    const q1 = await join.execute({ barbershopId: "shop-1", customerName: "João", whatsapp: "5599", serviceId: "svc-1", customerId: "cust-1" });
    const q2 = await join.execute({ barbershopId: "shop-2", customerName: "Maria", whatsapp: "5598", serviceId: "svc-2", customerId: "cust-2" });
    const all = await list.execute();
    expect(all.length).toBe(2);
    const onlyShop1 = await list.execute("shop-1");
    expect(onlyShop1.length).toBe(1);
    expect(onlyShop1[0].id).toBe(q1.id);
    expect(q1.status).toBe("waiting");
  });

  it("atualiza status para in_chair e completed com preço informado", async () => {
    const q = await join.execute({ barbershopId: "shop-1", customerName: "Ana", whatsapp: "55", serviceId: "svc-1" , customerId: "cust-1" });
    const inChair = await update.execute(q.id, "in_chair");
    expect(inChair.status).toBe("in_chair");
    const completed = await update.execute(q.id, "completed", { completedBy: "staff-1", finalPrice: 50 });
    expect(completed.status).toBe("completed");
    expect(completed.finalPrice).toBe(50);
    expect(completed.completedBy).toBe("staff-1");
    expect(typeof completed.completedAt).toBe("number");
  });

  it("cancela item e remove do histórico", async () => {
    const q = await join.execute({ barbershopId: "shop-1", customerName: "Ana", whatsapp: "55", serviceId: "svc-1", customerId: "cust-1" });
    const cancelled = await update.execute(q.id, "cancelled");
    expect(cancelled.status).toBe("cancelled");
    await del.execute(q.id);
    const listAll = await list.execute();
    expect(listAll.find(i => i.id === q.id)).toBeUndefined();
  });

  it("lança erro ao atualizar item inexistente", async () => {
    await expect(update.execute("not-found", "completed")).rejects.toBeInstanceOf(AppError);
  });
});

// ─── GetQueueWaitEstimateUseCase ──────────────────────────────────────────────

describe("GetQueueWaitEstimateUseCase", () => {
  let queues2: MockQueueRepository;
  let estimateUseCase: GetQueueWaitEstimateUseCase;

  beforeEach(() => {
    queues2 = new MockQueueRepository();
    estimateUseCase = new GetQueueWaitEstimateUseCase(queues2 as any);
  });

  it("fila vazia retorna peopleAhead: 0 e estimatedWaitMinutes: 0", async () => {
    const r = await estimateUseCase.execute("shop-x");
    expect(r).toEqual({ peopleAhead: 0, estimatedWaitMinutes: 0, items: [] });
  });

  it("soma corretamente avgTimeMinutes de N itens WAITING/IN_CHAIR", async () => {
    const t0 = Date.now();
    const a = await queues2.create({
      barbershopId: "s", serviceId: "svc", customerId: "c1",
      customerName: "A", whatsapp: "1",
    });
    const b = await queues2.create({
      barbershopId: "s", serviceId: "svc", customerId: "c2",
      customerName: "B", whatsapp: "2",
    });
    await queues2.updateStatus(b.id, "in_chair");
    // Preenche avgTimeMinutes (mock não pega do service como no repo real).
    const all = queues2.data;
    all.find((q) => q.id === a.id)!.serviceAvgTimeMinutes = 20;
    all.find((q) => q.id === b.id)!.serviceAvgTimeMinutes = 30;

    const r = await estimateUseCase.execute("s");
    expect(r.peopleAhead).toBe(2);
    expect(r.estimatedWaitMinutes).toBe(50);
    expect(r.items[0].customerName).toBe("A");
    expect(r.items[1].customerName).toBe("B");
    void t0;
  });

  it("ignora COMPLETED/CANCELLED", async () => {
    const a = await queues2.create({
      barbershopId: "s", serviceId: "svc", customerId: "c1",
      customerName: "A", whatsapp: "1",
    });
    const b = await queues2.create({
      barbershopId: "s", serviceId: "svc", customerId: "c2",
      customerName: "B", whatsapp: "2",
    });
    await queues2.updateStatus(a.id, "completed");
    await queues2.updateStatus(b.id, "cancelled");
    queues2.data.find((q) => q.id === a.id)!.serviceAvgTimeMinutes = 20;
    queues2.data.find((q) => q.id === b.id)!.serviceAvgTimeMinutes = 30;

    const r = await estimateUseCase.execute("s");
    expect(r.peopleAhead).toBe(0);
    expect(r.estimatedWaitMinutes).toBe(0);
  });
});

// ─── buildReminderMessage (Parte B) ───────────────────────────────────────────

function todayIsoSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

describe("buildReminderMessage — mensagem principal sem fila", () => {
  const apptBase = {
    id: "apt-1",
    barbershopId: "shop-1",
    barbershopName: "Barbearia Central",
    serviceId: "svc-1",
    serviceName: "Corte",
    servicePrice: 49.9,
    staffId: null,
    staffName: null,
    customerName: "João",
    whatsapp: "11999999999",
    date: new Date(`${todayIsoSP()}T00:00:00Z`),
    time: "15:30",
    status: "CONFIRMED" as const,
    reminderSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("mensagem principal não menciona fila nem 'Sem fila'", () => {
    const msg = buildReminderMessage(apptBase as any, {
      peopleAhead: 0,
      estimatedWaitMinutes: 0,
      items: [],
    });
    expect(msg).toContain("Olá, João");
    expect(msg).toContain("15:30");
    expect(msg).toContain("Barbearia Central");
    expect(msg).not.toContain("Fila no momento");
    expect(msg).not.toContain("Sem fila");
    expect(msg).toContain("Até já!");
  });

  it("mensagem principal é a mesma independentemente de haver fila", () => {
    const msgSemFila = buildReminderMessage(apptBase as any, {
      peopleAhead: 0,
      estimatedWaitMinutes: 0,
      items: [],
    });
    const msgComFila = buildReminderMessage(apptBase as any, {
      peopleAhead: 3,
      estimatedWaitMinutes: 60,
      items: [],
    });
    expect(msgSemFila).toBe(msgComFila);
  });
});

// ─── buildQueueUpdateMessage (Parte B — segunda mensagem com fuso SP) ─────────

describe("buildQueueUpdateMessage — estimativa de fila + fuso São Paulo", () => {
  /**
   * Helper: cria um instante absoluto representando HH:mm do "dia de hoje" em SP.
   * Usa offset -03:00 (fixo, sem DST desde 2013) para ser determinístico em
   * qualquer fuso onde o CI/maquinade teste rode.
   */
  function spInstant(hh: number, mm: number): Date {
    return new Date(`${todayIsoSP()}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-03:00`);
  }

  // A "data" do agendamento precisa cair no mesmo dia-SP do `spInstant`,
  // senão `toSaoPauloDateParts(appt.date)` lê o dia errado. Usamos 09:00 SP
  // para garantir — o horário real vem de `appt.time`.
  const apptDateInSp = spInstant(9, 0);
  const apptBase = {
    id: "apt-1",
    barbershopId: "shop-1",
    barbershopName: "Barbearia Central",
    serviceId: "svc-1",
    serviceName: "Corte",
    servicePrice: 49.9,
    staffId: null,
    staffName: null,
    customerName: "João",
    whatsapp: "11999999999",
    date: apptDateInSp,
    time: "15:30",
    status: "CONFIRMED" as const,
    reminderSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("fila adiantada: horário estimado == horário agendado (agora+fila < agendado)", () => {
    // Agendado 15:30 SP. Agora 10:00 SP, fila 60 min → estimativa 11:00 < 15:30 → 15:30.
    const now = spInstant(10, 0);
    const msg = buildQueueUpdateMessage(apptBase as any, {
      peopleAhead: 3,
      estimatedWaitMinutes: 60,
      items: [],
    }, now);
    expect(msg).toContain("3 pessoa(s)");
    expect(msg).toContain("60 min");
    expect(msg).toContain("Previsão de atendimento: por volta de *15:30*");
  });

  it("fila atrasada: horário estimado > horário agendado (agora+fila > agendado)", () => {
    // Agendado 15:30 SP. Agora 15:00 SP, fila 90 min → estimativa 16:30 > 15:30 → 16:30.
    const now = spInstant(15, 0);
    const msg = buildQueueUpdateMessage(apptBase as any, {
      peopleAhead: 2,
      estimatedWaitMinutes: 90,
      items: [],
    }, now);
    expect(msg).toContain("Previsão de atendimento: por volta de *16:30*");
  });

  it("fila atrasada que cruza a virada do dia: por volta de 00:15", () => {
    // Agendado 23:30 SP. Agora 23:00 SP, fila 75 min → estimativa 00:15 > 23:30 → 00:15.
    const apptLate = { ...apptBase, time: "23:30" };
    const now = spInstant(23, 0);
    const msg = buildQueueUpdateMessage(apptLate as any, {
      peopleAhead: 1,
      estimatedWaitMinutes: 75,
      items: [],
    }, now);
    expect(msg).toMatch(/Previsão de atendimento: por volta de \*00:15\*/);
  });
});

// ─── SendAppointmentRemindersUseCase com QueueEstimate ─────────────────────────
describe("SendAppointmentRemindersUseCase + getQueueWaitEstimate", () => {
  let apptRepo: MockAppointmentRepository;
  let queueRepo: MockQueueRepository;
  let getEstimate: GetQueueWaitEstimateUseCase;
  let reminders: SendAppointmentRemindersUseCase;
  let shops2: MockBarbershopRepository;

  beforeEach(() => {
    apptRepo = new MockAppointmentRepository();
    queueRepo = new MockQueueRepository();
    shops2 = new MockBarbershopRepository();
    getEstimate = new GetQueueWaitEstimateUseCase(queueRepo as any);
    reminders = new SendAppointmentRemindersUseCase(apptRepo as any, getEstimate, shops2 as any);
  });

  it("fila vazia: só a mensagem principal (sem segunda de fila)", async () => {
    const sendSpy = vi.spyOn(whatsapp, "sendWhatsAppMessage").mockResolvedValue(true);
    const create = new CreateAppointmentUseCase(apptRepo as any);
    const apt = await create.execute({
      barbershopId: "shop-1", serviceId: "svc-1",
      customerName: "Solo", whatsapp: "11912345678",
      date: todayIsoSP(), time: "10:00",
    }, { role: "MASTER_ADMIN" });

    const result = await reminders.execute();
    expect(result).toEqual({ sent: 1, failed: 0, queueMessagesFailed: 0 });
    // Só 1 chamada (a principal). Nenhuma segunda mensagem de fila.
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const body = sendSpy.mock.calls[0][1];
    expect(body).not.toContain("📋");
    expect(body).not.toContain("Previsão de atendimento");
    expect(body).not.toContain("pessoa(s)");
    expect(apptRepo.appointments.find((a) => a.id === apt.id)?.reminderSentAt).toBeInstanceOf(Date);
    sendSpy.mockRestore();
  });

  it("fila com pessoas: mensagem principal + segunda mensagem de fila", async () => {
    const sendSpy = vi.spyOn(whatsapp, "sendWhatsAppMessage").mockResolvedValue(true);
    const create = new CreateAppointmentUseCase(apptRepo as any);
    const apt = await create.execute({
      barbershopId: "shop-1", serviceId: "svc-1",
      customerName: "Cliente", whatsapp: "11912345678",
      date: todayIsoSP(), time: "10:00",
    }, { role: "MASTER_ADMIN" });

    // Cria 2 itens na fila da mesma barbearia, com durações.
    const q1 = await queueRepo.create({
      barbershopId: "shop-1", serviceId: "svc-1", customerId: "c1",
      customerName: "Fila1", whatsapp: "1",
    });
    const q2 = await queueRepo.create({
      barbershopId: "shop-1", serviceId: "svc-1", customerId: "c2",
      customerName: "Fila2", whatsapp: "2",
    });
    queueRepo.data.find((q) => q.id === q1.id)!.serviceAvgTimeMinutes = 25;
    queueRepo.data.find((q) => q.id === q2.id)!.serviceAvgTimeMinutes = 35;

    const result = await reminders.execute();
    expect(result).toEqual({ sent: 1, failed: 0, queueMessagesFailed: 0 });
    // 2 chamadas: principal + segunda de fila.
    expect(sendSpy).toHaveBeenCalledTimes(2);
    const mainBody = sendSpy.mock.calls[0][1];
    const queueBody = sendSpy.mock.calls[1][1];
    // Mensagem principal não menciona bloco de fila.
    expect(mainBody).not.toContain("📋");
    expect(mainBody).not.toContain("Previsão de atendimento");
    // Segunda mensagem contém contagem e minutos.
    expect(queueBody).toContain("2 pessoa(s)");
    expect(queueBody).toContain("60 min");
    expect(queueBody).toMatch(/Previsão de atendimento:/);
    expect(apptRepo.appointments.find((a) => a.id === apt.id)?.reminderSentAt).toBeInstanceOf(Date);
    sendSpy.mockRestore();
  });

  it("regressão: erro individual não aborta loop (mantém original)", async () => {
    const sendSpy = vi
      .spyOn(whatsapp, "sendWhatsAppMessage")
      .mockImplementation(async (phone: string) => {
        if (phone === "11987654321") throw new Error("boom");
        return true;
      });
    const create = new CreateAppointmentUseCase(apptRepo as any);
    await create.execute({
      barbershopId: "shop-1", serviceId: "svc-1",
      customerName: "Bom", whatsapp: "11912345678",
      date: todayIsoSP(), time: "11:00",
    }, { role: "MASTER_ADMIN" });
    await create.execute({
      barbershopId: "shop-1", serviceId: "svc-1",
      customerName: "Ruim", whatsapp: "11987654321",
      date: todayIsoSP(), time: "12:00",
    }, { role: "MASTER_ADMIN" });

    const result = await reminders.execute();
    expect(result).toEqual({ sent: 1, failed: 1, queueMessagesFailed: 0 });
    sendSpy.mockRestore();
  });
});

// ─── NotifyQueuePositionUpdatesUseCase ─────────────────────────────────────────

describe("NotifyQueuePositionUpdatesUseCase", () => {
  let queues3: MockQueueRepository;
  let shops: MockBarbershopRepository;
  let notifyUseCase: NotifyQueuePositionUpdatesUseCase;
  let sendSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    queues3 = new MockQueueRepository();
    shops = new MockBarbershopRepository() as any;
    shops.findById = vi.fn().mockResolvedValue({ id: "shop-1", name: "Barbearia Central" }) as any;
    notifyUseCase = new NotifyQueuePositionUpdatesUseCase(queues3 as any, shops as any);
    sendSpy = vi.spyOn(whatsapp, "sendWhatsAppMessage").mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("COMPLETED do item da frente: itens 2 e 3 recebem mensagem de posição", async () => {
    const a = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c1",
      customerName: "Primeiro", whatsapp: "5511111111111",
    });
    const b = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c2",
      customerName: "Segundo", whatsapp: "5522222222222",
    });
    const c = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c3",
      customerName: "Terceiro", whatsapp: "5533333333333",
    });
    // Preenche avgTimeMinutes para o estimado do 3º (1 item à frente: 30 min).
    queues3.data.find((q) => q.id === b.id)!.serviceAvgTimeMinutes = 30;
    queues3.data.find((q) => q.id === c.id)!.serviceAvgTimeMinutes = 30;

    const update = new UpdateQueueItemUseCase(queues3 as any, notifyUseCase);
    await update.execute(a.id, "completed");

    // Os 2 itens restantes (Segundo e Terceiro) recebem notificação.
    expect(sendSpy).toHaveBeenCalledTimes(2);

    // Segundo vira posição 1 → mensagem "Chegou sua vez".
    const callB = sendSpy.mock.calls.find((m: any) => m[0] === "5522222222222")!;
    expect(callB[1]).toContain("Chegou sua vez, Segundo");
    expect(callB[1]).toContain("Barbearia Central");
    expect(queues3.data.find((q) => q.id === b.id)!.lastNotifiedPosition).toBe(1);

    // Terceiro vira posição 2 → mensagem de atualização.
    const callC = sendSpy.mock.calls.find((m: any) => m[0] === "5533333333333")!;
    expect(callC[1]).toContain("Atualização de fila, Terceiro");
    expect(callC[1]).toContain("posição *2ª*");
    expect(callC[1]).toContain("30 min");
    expect(queues3.data.find((q) => q.id === c.id)!.lastNotifiedPosition).toBe(2);

    // O item completado (a) não recebe nenhuma mensagem.
    expect(sendSpy.mock.calls.find((m: any) => m[0] === "5511111111111")).toBeUndefined();

    void a;
  });

  it("rodar a mesma operação de novo (sem mudança real de fila) não reenvia", async () => {
    const a = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c1",
      customerName: "Primeiro", whatsapp: "5511111111111",
    });
    const b = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c2",
      customerName: "Segundo", whatsapp: "5522222222222",
    });
    const update = new UpdateQueueItemUseCase(queues3 as any, notifyUseCase);
    await update.execute(a.id, "completed"); // dispara 1x para "Segundo" (pos 1)
    expect(sendSpy).toHaveBeenCalledTimes(1);

    // Completar "Segundo" não dispara mais nada (fila vazia).
    await update.execute(b.id, "completed");
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it("DELETE do item da frente dispara aviso para o novo primeiro", async () => {
    const a = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c1",
      customerName: "Primeiro", whatsapp: "5511111111111",
    });
    const b = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c2",
      customerName: "Segundo", whatsapp: "5522222222222",
    });
    const delUseCase = new DeleteQueueItemUseCase(queues3 as any, notifyUseCase);
    await delUseCase.execute(a.id);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toBe("5522222222222");
    expect(queues3.data.find((q) => q.id === b.id)!.lastNotifiedPosition).toBe(1);
  });

  it("DELETE de item do meio recalcula e notifica quem mudou de posição", async () => {
    const a = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c1",
      customerName: "Primeiro", whatsapp: "5511111111111",
    });
    const b = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c2",
      customerName: "Segundo", whatsapp: "5522222222222",
    });
    const c = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c3",
      customerName: "Terceiro", whatsapp: "5533333333333",
    });
    queues3.data.find((q) => q.id === a.id)!.serviceAvgTimeMinutes = 30;

    // Notifica todos na 1ª passagem (a=1, b=2, c=3).
    await notifyUseCase.execute("shop-1");
    expect(sendSpy).toHaveBeenCalledTimes(3);
    expect(queues3.data.find((q) => q.id === c.id)!.lastNotifiedPosition).toBe(3);
    sendSpy.mockClear();

    // Deleta o "Segundo" (meio da fila). "Terceiro" cai de pos 3 → 2: deve ser notificado.
    const delUseCase = new DeleteQueueItemUseCase(queues3 as any, notifyUseCase);
    await delUseCase.execute(b.id);

    // Só "Terceiro" mudou de posição (3→2), "Primeiro" continua em 1.
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toBe("5533333333333");
    expect(sendSpy.mock.calls[0][1]).toContain("posição *2ª*");
    expect(queues3.data.find((q) => q.id === c.id)!.lastNotifiedPosition).toBe(2);
  });

  it("fila vazia não chama sendWhatsAppMessage", async () => {
    const update = new UpdateQueueItemUseCase(queues3 as any, notifyUseCase);
    const a = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c1",
      customerName: "Unico", whatsapp: "5511111111111",
    });
    await update.execute(a.id, "completed");
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("usa evolutionInstanceName da barbearia quando configurado", async () => {
    // Sobrescreve findById com uma barbearia contendo instanceName própria.
    shops.findById = vi
      .fn()
      .mockResolvedValue({ id: "shop-evo", name: "Evo Shop", evolutionInstanceName: "instancia-zeca" }) as any;

    await queues3.create({
      barbershopId: "shop-evo", serviceId: "svc", customerId: "c1",
      customerName: "Primeiro", whatsapp: "5511111111111",
    });

    await notifyUseCase.execute("shop-evo");

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const opts = sendSpy.mock.calls[0][2] as { instanceName?: string };
    expect(opts).toBeDefined();
    expect(opts.instanceName).toBe("instancia-zeca");
  });

  it("sem evolutionInstanceName na barbearia, passa instanceName = undefined (fallback)", async () => {
    // findById sem evolutionInstanceName ⇒ null.
    shops.findById = vi
      .fn()
      .mockResolvedValue({ id: "shop-1", name: "Barbearia Central", evolutionInstanceName: null }) as any;

    await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c1",
      customerName: "Primeiro", whatsapp: "5511111111111",
    });

    await notifyUseCase.execute("shop-1");

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const opts = sendSpy.mock.calls[0][2] as { instanceName?: string };
    expect(opts).toBeDefined();
    // undefined ⇒ fallback do env global.
    expect(opts.instanceName).toBeUndefined();
  });
});
