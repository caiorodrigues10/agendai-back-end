import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { MockQueueRepository } from "@/modules/queue/infra/repositories/mocks/MockQueueRepository";
import { MockAppointmentRepository } from "@/modules/appointments/infra/repositories/mocks/MockAppointmentRepository";
import { MockBarbershopRepository } from "@/modules/barbershops/infra/repositories/mocks/MockBarbershopRepository";
import { JoinQueueUseCase } from "./joinQueue/JoinQueueUseCase";
import { ListQueueUseCase } from "./listQueue/ListQueueUseCase";
import { UpdateQueueItemUseCase } from "./updateQueueItem/UpdateQueueItemUseCase";
import { DeleteQueueItemUseCase } from "./deleteQueueItem/DeleteQueueItemUseCase";
import {
  NotifyQueuePositionUpdatesUseCase,
  notifyCustomerJoinedQueue,
  buildQueueJoinedMessage,
  buildQueueCancelledMessage,
} from "./notifyQueuePositionUpdates/NotifyQueuePositionUpdatesUseCase";
import { GetQueueWaitEstimateUseCase } from "./getQueueWaitEstimate/GetQueueWaitEstimateUseCase";
import {
  buildReminderMessage,
  buildQueueUpdateMessage,
  CreateAppointmentUseCase,
  SendAppointmentRemindersUseCase,
} from "@/modules/appointments/useCases/appointmentUseCases";
import * as queueModule from "@/shared/infra/queue";
import { AppError } from "@/shared/errors/AppError";
import { isActiveQueueDuplicate, resolveQueueWhatsApp, STAFF_QUEUE_PLACEHOLDER_WHATSAPP } from "../utils/queueDuplicate";
import { updateQueueItemSchema } from "../schemas/queueSchemas";

let queues: MockQueueRepository;
let join: JoinQueueUseCase;
let list: ListQueueUseCase;
let update: UpdateQueueItemUseCase;
let del: DeleteQueueItemUseCase;
let notifyPosition: NotifyQueuePositionUpdatesUseCase;
let notifySpy: ReturnType<typeof vi.fn>;

const staffShop1 = { id: "u1", role: "OWNER", barbershopId: "shop-1" };
const staffShop2 = { id: "u2", role: "OWNER", barbershopId: "shop-2" };
const masterAdmin = { id: "admin", role: "MASTER_ADMIN" };

beforeEach(() => {
  queues = new MockQueueRepository();
  notifySpy = vi.fn().mockResolvedValue({ notified: 0, failed: 0 });
  notifyPosition = { execute: notifySpy } as any;
  const shopsStub = {
    findById: vi.fn().mockResolvedValue({
      id: "shop-1",
      name: "Barbearia Central",
      evolutionInstanceName: "inst-shop-1",
    }),
  };
  join = new JoinQueueUseCase(queues as any, shopsStub as any);
  list = new ListQueueUseCase(queues as any);
  update = new UpdateQueueItemUseCase(queues as any, notifyPosition, shopsStub as any);
  del = new DeleteQueueItemUseCase(queues as any, notifyPosition);
});

describe("Queue module", () => {
  it("join queue e lista por barbearia", async () => {
    // JoinQueueUseCase agora valida shop/service no Prisma — este spec usa mock repo
    // e precisa mockar assertPublicShopOperationalAccess + prisma.service.
    // Cobertura de join com Prisma fica nos testes de integração HTTP.
    const q1 = await queues.create({
      barbershopId: "shop-1",
      customerName: "João",
      whatsapp: "5599",
      serviceId: "svc-1",
      customerId: "cust-1",
    });
    const q2 = await queues.create({
      barbershopId: "shop-2",
      customerName: "Maria",
      whatsapp: "5598",
      serviceId: "svc-2",
      customerId: "cust-2",
    });
    const all = await list.execute();
    expect(all.length).toBe(2);
    const onlyShop1 = await list.execute("shop-1");
    expect(onlyShop1.length).toBe(1);
    expect(onlyShop1[0].id).toBe(q1.id);
    expect(q1.status).toBe("waiting");
  });

  it("atualiza status para in_chair e completed com preço informado", async () => {
    const q = await queues.create({
      barbershopId: "shop-1",
      customerName: "Ana",
      whatsapp: "55",
      serviceId: "svc-1",
      customerId: "cust-1",
    });
    const inChair = await update.execute(q.id, "in_chair", staffShop1);
    expect(inChair.status).toBe("in_chair");
    const completed = await update.execute(q.id, "completed", staffShop1, {
      completedBy: "staff-1",
      finalPrice: 50,
    });
    expect(completed.status).toBe("completed");
    expect(completed.finalPrice).toBe(50);
    expect(completed.completedBy).toBe("staff-1");
    expect(typeof completed.completedAt).toBe("number");
  });

  it("Chamar enfileira WhatsApp ao ir para in_chair", async () => {
    const sendSpy = vi.spyOn(queueModule, "enqueueWhatsApp").mockResolvedValue(undefined);
    const q = await queues.create({
      barbershopId: "shop-1",
      customerName: "Ana",
      whatsapp: "11988887777",
      serviceId: "svc-1",
      customerId: "cust-call",
    });
    await update.execute(q.id, "in_chair", staffShop1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toMatchObject({
      phone: "11988887777",
      deduplicationKey: `call:${q.id}`,
    });
    expect(sendSpy.mock.calls[0][0].message).toContain("Chegou sua vez, Ana");
    expect(sendSpy.mock.calls[0][0].message).toContain("Barbearia Central");
    sendSpy.mockRestore();
  });

  it("Cancelar enfileira WhatsApp ao cliente", async () => {
    const sendSpy = vi.spyOn(queueModule, "enqueueWhatsApp").mockResolvedValue(undefined);
    const q = await queues.create({
      barbershopId: "shop-1",
      customerName: "Ana",
      whatsapp: "11988887777",
      serviceId: "svc-1",
      customerId: "cust-cancel",
    });
    await update.execute(q.id, "cancelled", staffShop1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toMatchObject({
      phone: "11988887777",
      deduplicationKey: `cancel:${q.id}`,
    });
    expect(sendSpy.mock.calls[0][0].message).toContain("foi cancelado");
    expect(sendSpy.mock.calls[0][0].message).toContain("Ana");
    sendSpy.mockRestore();
  });

  it("Cancelar não enfileira WhatsApp para placeholder", async () => {
    const sendSpy = vi.spyOn(queueModule, "enqueueWhatsApp").mockResolvedValue(undefined);
    const q = await queues.create({
      barbershopId: "shop-1",
      customerName: "Sem Zap",
      whatsapp: STAFF_QUEUE_PLACEHOLDER_WHATSAPP,
      serviceId: "svc-1",
      customerId: "cust-cancel-placeholder",
    });
    await update.execute(q.id, "cancelled", staffShop1);
    expect(sendSpy).not.toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  it("Chamar não enfileira WhatsApp para placeholder", async () => {
    const sendSpy = vi.spyOn(queueModule, "enqueueWhatsApp").mockResolvedValue(undefined);
    const q = await queues.create({
      barbershopId: "shop-1",
      customerName: "Sem Zap",
      whatsapp: STAFF_QUEUE_PLACEHOLDER_WHATSAPP,
      serviceId: "svc-1",
      customerId: "cust-placeholder",
    });
    await update.execute(q.id, "in_chair", staffShop1);
    expect(sendSpy).not.toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  it("entrada na fila avisa o cliente (posição 2) e grava lastNotifiedPosition", async () => {
    const sendSpy = vi.spyOn(queueModule, "enqueueWhatsApp").mockResolvedValue(undefined);
    const shopsForJoin = {
      findById: vi.fn().mockResolvedValue({
        id: "shop-1",
        name: "Barbearia Central",
        evolutionInstanceName: "inst-shop-1",
      }),
    };
    const first = await queues.create({
      barbershopId: "shop-1",
      customerName: "Frente",
      whatsapp: "11911111111",
      serviceId: "svc-1",
      customerId: "cust-front",
    });
    queues.data.find((q) => q.id === first.id)!.serviceAvgTimeMinutes = 25;
    const joiner = await queues.create({
      barbershopId: "shop-1",
      customerName: "Caio",
      whatsapp: "11988887777",
      serviceId: "svc-1",
      customerId: "cust-join",
    });
    await notifyCustomerJoinedQueue(joiner, queues as any, shopsForJoin as any);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toMatchObject({
      phone: "11988887777",
      deduplicationKey: `join-customer:${joiner.id}`,
    });
    expect(sendSpy.mock.calls[0][0].message).toContain("Posição: *2ª*");
    expect(sendSpy.mock.calls[0][0].message).toContain("25 min");
    expect(sendSpy.mock.calls[0][0].message).not.toContain("Chegou sua vez");
    expect(queues.data.find((q) => q.id === joiner.id)!.lastNotifiedPosition).toBe(2);
    sendSpy.mockRestore();
  });

  it("buildQueueJoinedMessage na 1ª posição pede para aguardar ser chamado", () => {
    const msg = buildQueueJoinedMessage("Caio", "AgendAI", 1, 0);
    expect(msg).toContain("é o próximo");
    expect(msg).toContain("Aguarde ser chamado");
    expect(msg).not.toContain("Chegou sua vez");
    expect(buildQueueCancelledMessage("Ana", "AgendAI")).toContain("foi cancelado");
  });

  it("ignora completedAt extra no PATCH (timestamp fica no servidor)", () => {
    const parsed = updateQueueItemSchema.parse({
      status: "completed",
      finalPrice: 45,
      completedAt: Date.now(),
    });
    expect(parsed).toEqual({ status: "completed", finalPrice: 45 });
    expect("completedAt" in parsed).toBe(false);
  });

  it("volta da cadeira para a espera na posição escolhida", async () => {
    const first = await queues.create({
      barbershopId: "shop-1",
      customerName: "Primeiro",
      whatsapp: "1",
      serviceId: "svc-1",
      customerId: "c1",
    });
    const second = await queues.create({
      barbershopId: "shop-1",
      customerName: "Segundo",
      whatsapp: "2",
      serviceId: "svc-1",
      customerId: "c2",
    });
    await update.execute(first.id, "in_chair", staffShop1);
    const back = await update.execute(first.id, "waiting", staffShop1, { insertAt: 0 });
    expect(back.status).toBe("waiting");
    expect(back.joinedAt).toBeLessThan(second.joinedAt);
  });

  it("cancela item e remove do histórico", async () => {
    const q = await queues.create({
      barbershopId: "shop-1",
      customerName: "Ana",
      whatsapp: "55",
      serviceId: "svc-1",
      customerId: "cust-1",
    });
    const cancelled = await update.execute(q.id, "cancelled", staffShop1);
    expect(cancelled.status).toBe("cancelled");
    await del.execute(q.id, staffShop1);
    const listAll = await list.execute();
    expect(listAll.find((i) => i.id === q.id)).toBeUndefined();
  });

  it("lança erro ao atualizar item inexistente", async () => {
    await expect(
      update.execute("not-found", "completed", staffShop1)
    ).rejects.toBeInstanceOf(AppError);
  });

  it("nega update/delete cross-tenant (403)", async () => {
    const q = await queues.create({
      barbershopId: "shop-1",
      customerName: "Ana",
      whatsapp: "55",
      serviceId: "svc-1",
      customerId: "cust-1",
    });
    await expect(
      update.execute(q.id, "in_chair", staffShop2)
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(del.execute(q.id, staffShop2)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("MASTER_ADMIN pode mutar qualquer tenant", async () => {
    const q = await queues.create({
      barbershopId: "shop-1",
      customerName: "Ana",
      whatsapp: "55",
      serviceId: "svc-1",
      customerId: "cust-1",
    });
    const updated = await update.execute(q.id, "in_chair", masterAdmin);
    expect(updated.status).toBe("in_chair");
  });

  it("rejeita status inválido e transição ilegal", async () => {
    const q = await queues.create({
      barbershopId: "shop-1",
      customerName: "Ana",
      whatsapp: "55",
      serviceId: "svc-1",
      customerId: "cust-1",
    });
    await expect(
      update.execute(q.id, "flying", staffShop1)
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      update.execute(q.id, "completed", staffShop1)
    ).rejects.toMatchObject({ statusCode: 409 });
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
    const sendSpy = vi.spyOn(queueModule, "enqueueWhatsApp").mockResolvedValue(undefined);
    const create = new CreateAppointmentUseCase(apptRepo as any);
    const apt = await create.execute({
      barbershopId: "shop-1", serviceId: "svc-1",
      customerName: "Solo", whatsapp: "11912345678",
      date: todayIsoSP(), time: "10:00",
    }, { role: "MASTER_ADMIN" });

    const result = await reminders.execute();
    expect(result).toEqual({ sent: 1, failed: 0, queueMessagesFailed: 0 });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const body = sendSpy.mock.calls[0][0].message;
    expect(body).not.toContain("📋");
    expect(body).not.toContain("Previsão de atendimento");
    expect(body).not.toContain("pessoa(s)");
    expect(apptRepo.appointments.find((a) => a.id === apt.id)?.reminderSentAt).toBeInstanceOf(Date);
    sendSpy.mockRestore();
  });

  it("fila com pessoas: mensagem principal + segunda mensagem de fila", async () => {
    const sendSpy = vi.spyOn(queueModule, "enqueueWhatsApp").mockResolvedValue(undefined);
    const create = new CreateAppointmentUseCase(apptRepo as any);
    const apt = await create.execute({
      barbershopId: "shop-1", serviceId: "svc-1",
      customerName: "Cliente", whatsapp: "11912345678",
      date: todayIsoSP(), time: "10:00",
    }, { role: "MASTER_ADMIN" });

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
    expect(sendSpy).toHaveBeenCalledTimes(2);
    const mainBody = sendSpy.mock.calls[0][0].message;
    const queueBody = sendSpy.mock.calls[1][0].message;
    expect(mainBody).not.toContain("📋");
    expect(mainBody).not.toContain("Previsão de atendimento");
    expect(queueBody).toContain("2 pessoa(s)");
    expect(queueBody).toContain("60 min");
    expect(queueBody).toMatch(/Previsão de atendimento:/);
    expect(apptRepo.appointments.find((a) => a.id === apt.id)?.reminderSentAt).toBeInstanceOf(Date);
    sendSpy.mockRestore();
  });

  it("regressão: erro individual não aborta loop (mantém original)", async () => {
    const sendSpy = vi
      .spyOn(queueModule, "enqueueWhatsApp")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(undefined);
    const create = new CreateAppointmentUseCase(apptRepo as any);
    await create.execute({
      barbershopId: "shop-1", serviceId: "svc-1",
      customerName: "Ruim", whatsapp: "11987654321",
      date: todayIsoSP(), time: "12:00",
    }, { role: "MASTER_ADMIN" });
    await create.execute({
      barbershopId: "shop-1", serviceId: "svc-1",
      customerName: "Bom", whatsapp: "11912345678",
      date: todayIsoSP(), time: "11:00",
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
    shops.findById = vi.fn().mockResolvedValue({
      id: "shop-1",
      name: "Barbearia Central",
      evolutionInstanceName: "inst-shop-1",
    }) as any;
    notifyUseCase = new NotifyQueuePositionUpdatesUseCase(queues3 as any, shops as any);
    sendSpy = vi.spyOn(queueModule, "enqueueWhatsApp").mockResolvedValue(undefined);
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

    const update = new UpdateQueueItemUseCase(queues3 as any, notifyUseCase, shops);
    await update.execute(a.id, "in_chair", staffShop1);
    await update.execute(a.id, "completed", staffShop1);

    // Chamado (Primeiro) + 2 restantes (Segundo e Terceiro).
    expect(sendSpy).toHaveBeenCalledTimes(3);

    const callA = sendSpy.mock.calls.find((m: any) => m[0].deduplicationKey === `call:${a.id}`)!;
    expect(callA[0].phone).toBe("5511111111111");
    expect(callA[0].message).toContain("Chegou sua vez, Primeiro");

    // Segundo vira posição 1 → mensagem "Chegou sua vez".
    const callB = sendSpy.mock.calls.find((m: any) => m[0].phone === "5522222222222")!;
    expect(callB[0].message).toContain("Chegou sua vez, Segundo");
    expect(callB[0].message).toContain("Barbearia Central");
    expect(queues3.data.find((q) => q.id === b.id)!.lastNotifiedPosition).toBe(1);

    // Terceiro vira posição 2 → mensagem de atualização.
    const callC = sendSpy.mock.calls.find((m: any) => m[0].phone === "5533333333333")!;
    expect(callC[0].message).toContain("Atualização de fila, Terceiro");
    expect(callC[0].message).toContain("posição *2ª*");
    expect(callC[0].message).toContain("30 min");
    expect(queues3.data.find((q) => q.id === c.id)!.lastNotifiedPosition).toBe(2);

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
    const update = new UpdateQueueItemUseCase(queues3 as any, notifyUseCase, shops);
    // waiting → completed é ilegal; usar waiting → in_chair → completed
    await update.execute(a.id, "in_chair", staffShop1);
    await update.execute(a.id, "completed", staffShop1);
    // call:Primeiro + posição do Segundo
    expect(sendSpy).toHaveBeenCalledTimes(2);

    await update.execute(b.id, "in_chair", staffShop1);
    await update.execute(b.id, "completed", staffShop1);
    // + call:Segundo; fila vazia não notifica waiting
    expect(sendSpy).toHaveBeenCalledTimes(3);
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
    await delUseCase.execute(a.id, staffShop1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].phone).toBe("5522222222222");
    expect(queues3.data.find((q) => q.id === b.id)!.lastNotifiedPosition).toBe(1);
  });

  it("Cancelar o da frente avisa o cancelado e o novo primeiro", async () => {
    const a = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c1",
      customerName: "Primeiro", whatsapp: "5511111111111",
    });
    const b = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c2",
      customerName: "Segundo", whatsapp: "5522222222222",
    });
    const updateUc = new UpdateQueueItemUseCase(queues3 as any, notifyUseCase, shops);
    await updateUc.execute(a.id, "cancelled", staffShop1);

    expect(sendSpy).toHaveBeenCalledTimes(2);
    const cancelCall = sendSpy.mock.calls.find(
      (m: any) => m[0].deduplicationKey === `cancel:${a.id}`
    );
    expect(cancelCall?.[0].phone).toBe("5511111111111");
    expect(cancelCall?.[0].message).toContain("foi cancelado");

    const nextCall = sendSpy.mock.calls.find((m: any) => m[0].phone === "5522222222222");
    expect(nextCall?.[0].message).toContain("Chegou sua vez, Segundo");
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
    await delUseCase.execute(b.id, staffShop1);

    // Só "Terceiro" mudou de posição (3→2), "Primeiro" continua em 1.
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].phone).toBe("5533333333333");
    expect(sendSpy.mock.calls[0][0].message).toContain("posição *2ª*");
    expect(queues3.data.find((q) => q.id === c.id)!.lastNotifiedPosition).toBe(2);
  });

  it("único cliente: Chamar envia WhatsApp; completar não notifica waiting vazio", async () => {
    const update = new UpdateQueueItemUseCase(queues3 as any, notifyUseCase, shops);
    const a = await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c1",
      customerName: "Unico", whatsapp: "5511111111111",
    });
    await update.execute(a.id, "in_chair", staffShop1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].deduplicationKey).toBe(`call:${a.id}`);
    sendSpy.mockClear();
    await update.execute(a.id, "completed", staffShop1);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("usa evolutionInstanceName da barbearia quando configurado", async () => {
    shops.findById = vi
      .fn()
      .mockResolvedValue({ id: "shop-evo", name: "Evo Shop", evolutionInstanceName: "instancia-zeca" }) as any;

    await queues3.create({
      barbershopId: "shop-evo", serviceId: "svc", customerId: "c1",
      customerName: "Primeiro", whatsapp: "5511111111111",
    });

    await notifyUseCase.execute("shop-evo");

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const jobData = sendSpy.mock.calls[0][0] as { instanceName?: string };
    expect(jobData).toBeDefined();
    expect(jobData.instanceName).toBe("instancia-zeca");
  });

  it("sem evolutionInstanceName na barbearia, não enfileira WhatsApp", async () => {
    shops.findById = vi
      .fn()
      .mockResolvedValue({ id: "shop-1", name: "Barbearia Central", evolutionInstanceName: null }) as any;

    await queues3.create({
      barbershopId: "shop-1", serviceId: "svc", customerId: "c1",
      customerName: "Primeiro", whatsapp: "5511111111111",
    });

    await notifyUseCase.execute("shop-1");

    expect(sendSpy).not.toHaveBeenCalled();
  });
});

describe("isActiveQueueDuplicate", () => {
  const base = {
    customerId: "sess-1",
    whatsapp: "11988887777",
    customerName: "Caio",
  };

  it("bloqueia o mesmo customerId (mesma sessão)", () => {
    expect(
      isActiveQueueDuplicate(base, {
        customerId: "sess-1",
        whatsappDigits: "11999999999",
        customerName: "Outra",
      })
    ).toBe(true);
  });

  it("permite outro nome no mesmo WhatsApp (adicionar outra pessoa)", () => {
    expect(
      isActiveQueueDuplicate(base, {
        customerId: "sess-2",
        whatsappDigits: "11988887777",
        customerName: "Maria",
      })
    ).toBe(false);
  });

  it("resolveQueueWhatsApp: vazio vira placeholder; número válido permanece", () => {
    expect(resolveQueueWhatsApp("")).toBe(STAFF_QUEUE_PLACEHOLDER_WHATSAPP);
    expect(resolveQueueWhatsApp("   ")).toBe(STAFF_QUEUE_PLACEHOLDER_WHATSAPP);
    expect(resolveQueueWhatsApp("11988887777")).toBe("11988887777");
  });
});
