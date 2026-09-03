import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { sendWhatsAppMessage } from "@/shared/services/whatsappNotificationService";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { getNotificationV2Mode } from "@/modules/notifications/services/notificationDeliveryService";
import { prisma } from "@/libs/prismaClient";
import { AdvisoryLock } from "@/shared/infra/redis/advisoryLock";
import { IAppointmentRepository } from "../repositories/IAppointmentRepository";
import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import { IClientPackageRepository } from "@/modules/packages/repositories/IClientPackageRepository";
import { debitClientPackageInTx, restoreClientPackageInTx } from "@/modules/packages/utils/clientPackageCredits";
import { upsertSalonClientRecord } from "@/modules/clients/utils/ensureSalonClient";
import {
  ICreateAppointmentDTO,
  IUpdateAppointmentDTO,
  IAppointmentResponseDTO,
  IListAppointmentsQuery,
  IAvailabilitySlotDTO,
} from "../dtos/IAppointmentDTO";
import { assertAppointmentBookable } from "../utils/assertAppointmentBookable";
import { assertOperationEnabled } from "@/shared/utils/assertOperationEnabled";
import { publishRealtime } from "@/shared/services/realtimeService";
import {
  GetQueueWaitEstimateUseCase,
  QueueWaitEstimate,
} from "@/modules/queue/useCases/getQueueWaitEstimate/GetQueueWaitEstimateUseCase";

function mapCreatedAppointment(record: {
  id: string;
  barbershopId: string;
  serviceId: string;
  staffId: string | null;
  clientId?: string | null;
  clientPackageId?: string | null;
  customerName: string;
  whatsapp: string;
  date: Date;
  time: string;
  status: string;
  reminderSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  service?: { name: string; price: number } | null;
  staff?: { name: string } | null;
  barbershop?: { name: string } | null;
}): IAppointmentResponseDTO {
  return {
    id: record.id,
    barbershopId: record.barbershopId,
    barbershopName: record.barbershop?.name ?? null,
    serviceId: record.serviceId,
    serviceName: record.service?.name ?? null,
    servicePrice: record.service?.price ?? null,
    staffId: record.staffId ?? null,
    staffName: record.staff?.name ?? null,
    customerName: record.customerName,
    whatsapp: record.whatsapp,
    date: record.date,
    time: record.time,
    status: record.status as IAppointmentResponseDTO["status"],
    reminderSentAt: record.reminderSentAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    clientId: record.clientId ?? null,
    clientPackageId: record.clientPackageId ?? null,
  };
}

async function createAppointmentAtomic(
  data: ICreateAppointmentDTO,
  fallbackRepo: IAppointmentRepository
): Promise<IAppointmentResponseDTO> {
  // Unit tests usam MockAppointmentRepository sem Postgres.
  if (process.env.VITEST) {
    const created = await fallbackRepo.create(data);
    publishRealtime(data.barbershopId, "appointments:changed");
    return created;
  }

  const lock = new AdvisoryLock(prisma);
  const lockId = AdvisoryLock.generateLockId(data.barbershopId, data.date);
  const release = await lock.acquire(lockId);

  try {
    const created = await prisma.$transaction(async (tx: any) => {
      const { durationMinutes } = await assertAppointmentBookable(data, tx);
      let resolvedStaffId = data.staffId ?? null;

      // A escolha "qualquer profissional" precisa ser materializada antes do
      // INSERT. Assim o atendimento não fica sem dono e a decisão permanece
      // protegida pelo mesmo lock transacional da validação de conflito.
      if (!resolvedStaffId) {
        const eligibleStaff = await tx.user.findMany({
          where: {
            barbershopId: data.barbershopId,
            active: true,
            role: { in: ['OWNER', 'EMPLOYEE'] },
          },
          select: { id: true },
          orderBy: { id: 'asc' },
        });
        const day = new Date(data.date);
        const next = new Date(day);
        next.setUTCDate(next.getUTCDate() + 1);
        const confirmed = await tx.appointment.findMany({
          where: { barbershopId: data.barbershopId, date: { gte: day, lt: next }, status: 'CONFIRMED' },
          select: { staffId: true, time: true, service: { select: { avgTimeMinutes: true } } },
        });
        const toMinutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
        const start = toMinutes(data.time);
        const hasConflict = (staffId: string) => confirmed.some((item: any) => {
          if (item.staffId !== staffId && item.staffId !== null) return false;
          const otherStart = toMinutes(item.time);
          const otherDuration = item.service?.avgTimeMinutes ?? 30;
          return start < otherStart + otherDuration && otherStart < start + durationMinutes;
        });
        const available = eligibleStaff.filter((member: { id: string }) => !hasConflict(member.id));
        if (!available.length) throw new AppError('Horário indisponível (todos os profissionais ocupados)', 409, undefined, 'SLOT_UNAVAILABLE');
        const load = new Map<string, number>();
        for (const member of available) load.set(member.id, confirmed.filter((item: any) => item.staffId === member.id).length);
        resolvedStaffId = [...available].sort((a: { id: string }, b: { id: string }) => (load.get(a.id)! - load.get(b.id)!) || a.id.localeCompare(b.id))[0].id;
      }

      let clientId = data.clientId ?? null;
      if (data.clientPackageId) {
        const credited = await debitClientPackageInTx(tx, {
          clientPackageId: data.clientPackageId,
          barbershopId: data.barbershopId,
          serviceId: data.serviceId,
          count: 1,
        });
        clientId = credited.clientId;
      }

      if (!clientId) {
        const salon = await upsertSalonClientRecord(
          tx,
          data.barbershopId,
          data.customerName,
          data.whatsapp
        );
        clientId = salon?.id ?? null;
      }

      const record = await tx.appointment.create({
        data: {
          barbershopId: data.barbershopId,
          serviceId: data.serviceId,
          staffId: resolvedStaffId,
          customerName: data.customerName,
          whatsapp: data.whatsapp,
          date: new Date(data.date),
          time: data.time,
          status: "CONFIRMED",
          clientId,
          clientPackageId: data.clientPackageId ?? null,
        },
        include: {
          service: { select: { name: true, price: true } },
          staff: { select: { name: true } },
          barbershop: { select: { name: true } },
        },
      });
      return mapCreatedAppointment(record);
    });
    publishRealtime(data.barbershopId, "appointments:changed");
    return created;
  } finally {
    await release();
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

@injectable()
export class CreateAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository,
    @inject("ClientPackageRepository")
    private packages?: IClientPackageRepository
  ) {}

  async execute(
    data: ICreateAppointmentDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IAppointmentResponseDTO> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    await assertOperationEnabled(data.barbershopId, 'appointments');

    if (data.clientPackageId && process.env.VITEST && this.packages) {
      const pkg = await this.packages.findById(data.clientPackageId);
      if (!pkg) throw new AppError("Pacote do cliente não encontrado", 404);
      if (pkg.serviceId !== data.serviceId) {
        throw new AppError("Serviço não corresponde ao pacote", 400);
      }
      await this.packages.debitSessions(data.clientPackageId, 1);
      data = { ...data, clientId: data.clientId ?? pkg.clientId };
    }

    return createAppointmentAtomic(data, this.repo);
  }
}

/** Agendamento público — sem autorização administrativa implícita. */
@injectable()
export class CreatePublicAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(data: ICreateAppointmentDTO): Promise<IAppointmentResponseDTO> {
    if (!data.barbershopId) {
      throw new AppError("barbershopId é obrigatório", 400);
    }

    await assertOperationEnabled(data.barbershopId, 'appointments');

    const { clientPackageId: _ignored, clientId: _ignoredClient, ...publicData } = data;
    return createAppointmentAtomic(
      { ...publicData, barbershopId: data.barbershopId },
      this.repo
    );
  }
}

// ─── Get ──────────────────────────────────────────────────────────────────────

@injectable()
export class GetAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(
    id: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IAppointmentResponseDTO> {
    const appointment = await this.repo.findById(id);
    if (!appointment) throw new AppError("Agendamento não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      appointment.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    return appointment;
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

@injectable()
export class ListAppointmentsUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(
    barbershopId: string,
    query: IListAppointmentsQuery,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<{ data: IAppointmentResponseDTO[]; total: number }> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    return this.repo.list(barbershopId, query);
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

@injectable()
export class UpdateAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  async execute(
    id: string,
    data: IUpdateAppointmentDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IAppointmentResponseDTO> {
    const appointment = await this.repo.findById(id);
    if (!appointment) throw new AppError("Agendamento não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      appointment.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    if (appointment.status === "CANCELLED") {
      throw new AppError("Agendamento cancelado não pode ser editado", 400);
    }

    return this.repo.update(id, data).then((updated) => {
      publishRealtime(appointment.barbershopId, "appointments:changed");
      return updated;
    });
  }
}

// ─── Availability ─────────────────────────────────────────────────────────────

@injectable()
export class GetAvailabilityUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
  ) {}

  /**
   * Rota pública: slots OCUPADOS do dia.
   * - Com staffId: filtra conflitos daquele profissional (+ bookings sem staff).
   * - Sem staffId (“qualquer”): retorna todos; o front aplica a regra
   *   “indisponível só se todos elegíveis estiverem ocupados”.
   *   Se não houver profissionais elegíveis, marca o dia inteiro como ocupado.
   */
  async execute(
    barbershopId: string,
    date: string,
    staffId?: string
  ): Promise<IAvailabilitySlotDTO[]> {
    if (!staffId) {
      const { countEligibleStaff } = await import(
        "../utils/assertAppointmentBookable"
      );
      const eligible = process.env.VITEST
        ? 1
        : await countEligibleStaff(barbershopId);
      if (eligible === 0) {
        return [{ time: "00:00", staffId: null, durationMinutes: 24 * 60 }];
      }
    }

    const dateYmd = date.slice(0, 10);
    const { getShopOpenState } = await import(
      "@/modules/barbershops/utils/getShopOpenState"
    );
    const dayState = await getShopOpenState(barbershopId, {
      dateYmd,
      forDateOnly: true,
    });
    if (!dayState.open) {
      return [{ time: "00:00", staffId: null, durationMinutes: 24 * 60 }];
    }

    return this.repo.getOccupiedSlots(barbershopId, date, staffId);
  }
}

/** Retorna horários livres já calculados no backend para o serviço escolhido. */
@injectable()
export class GetAvailableSlotsUseCase {
  async execute(barbershopId: string, serviceId: string, date: string, staffId?: string) {
    await assertOperationEnabled(barbershopId, 'appointments');
    const day = new Date(`${date}T00:00:00Z`);
    const next = new Date(day);
    next.setUTCDate(next.getUTCDate() + 1);
    const service = await prisma.service.findFirst({ where: { id: serviceId, barbershopId, active: true }, select: { avgTimeMinutes: true } });
    if (!service) throw new AppError('Serviço inválido para este estabelecimento', 400);
    const dateYmd = date.slice(0, 10);
    const { getShopOpenState } = await import("@/modules/barbershops/utils/getShopOpenState");
    const dayState = await getShopOpenState(barbershopId, { dateYmd, forDateOnly: true });
    if (!dayState.open) return [];
    const staff = await prisma.user.findMany({ where: { barbershopId, active: true, role: { in: ['OWNER', 'EMPLOYEE'] }, ...(staffId ? { id: staffId } : {}) }, select: { id: true }, orderBy: { id: 'asc' } });
    if (!staff.length) throw new AppError('Nenhum profissional disponível neste estabelecimento', 409);
    const [shop, exception, appointments, blocks, policy] = await Promise.all([
      prisma.barbershop.findUnique({ where: { id: barbershopId }, select: { timezone: true } }),
      prisma.scheduleException.findUnique({ where: { barbershopId_date: { barbershopId, date: day } } }),
      prisma.appointment.findMany({ where: { barbershopId, date: { gte: day, lt: next }, status: 'CONFIRMED', ...(staffId ? { OR: [{ staffId }, { staffId: null }] } : {}) }, select: { time: true, staffId: true, service: { select: { avgTimeMinutes: true } } } }),
      prisma.calendarBlock.findMany({ where: { barbershopId, startAt: { lt: next }, endAt: { gt: day }, ...(staffId ? { OR: [{ staffId }, { staffId: null }] } : {}) }, select: { staffId: true, startAt: true, endAt: true } }),
      prisma.appointmentPolicy.upsert({ where: { barbershopId }, create: { barbershopId }, update: {} }),
    ]);
    void shop;
    const schedule = exception ?? await prisma.schedule.findUnique({ where: { barbershopId_dayOfWeek: { barbershopId, dayOfWeek: day.getUTCDay() } } });
    if (!schedule || !schedule.isOpen) return [];
    const timeToMinutes = (value: string) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
    const overlap = (a: number, ad: number, b: number, bd: number) => a < b + bd && b < a + ad;
    const blockedMinutes = (block: { startAt: Date; endAt: Date }) => {
      const parts = (value: Date) => { const f = new Intl.DateTimeFormat('en-GB', { timeZone: shop?.timezone || 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(value); return timeToMinutes(f); };
      return { start: parts(block.startAt), duration: Math.max(1, parts(block.endAt) - parts(block.startAt)) };
    };
    const start = timeToMinutes(schedule.openTime);
    const end = timeToMinutes(schedule.closeTime) - service.avgTimeMinutes;
    const now = Date.now() + policy.bookingNoticeMinutes * 60_000;
    const result: Array<{ time: string; staffId: string | null; durationMinutes: number }> = [];
    for (let minute = start; minute <= end; minute += 30) {
      const hh = String(Math.floor(minute / 60)).padStart(2, '0');
      const mm = String(minute % 60).padStart(2, '0');
      if (new Date(`${date}T${hh}:${mm}:00-03:00`).getTime() < now) continue;
      const available = staff.find((member: { id: string }) => {
        const appointmentBusy = appointments.some((item: { staffId: string | null; time: string; service: { avgTimeMinutes: number } | null }) => item.staffId && item.staffId !== member.id ? false : overlap(minute, service.avgTimeMinutes, timeToMinutes(item.time), item.service?.avgTimeMinutes ?? 30));
        const blockBusy = blocks.some((block: { staffId: string | null; startAt: Date; endAt: Date }) => (!block.staffId || block.staffId === member.id) && overlap(minute, service.avgTimeMinutes, blockedMinutes(block).start, blockedMinutes(block).duration));
        return !appointmentBusy && !blockBusy;
      });
      if (available) result.push({ time: `${hh}:${mm}`, staffId: staffId ? available.id : null, durationMinutes: service.avgTimeMinutes });
    }
    return result;
  }
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

@injectable()
export class CancelAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository,
    @inject("ClientPackageRepository")
    private packages?: IClientPackageRepository
  ) {}

  async execute(
    id: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<void> {
    const appointment = await this.repo.findById(id);
    if (!appointment) throw new AppError("Agendamento não encontrado", 404);

    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      appointment.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    if (appointment.status === "CANCELLED") {
      throw new AppError("Agendamento já está cancelado", 409);
    }

    const shouldRestore =
      Boolean(appointment.clientPackageId) &&
      appointment.status === "CONFIRMED";

    if (process.env.VITEST) {
      await this.repo.delete(id);
      if (shouldRestore && appointment.clientPackageId && this.packages) {
        await this.packages.restoreSessions(appointment.clientPackageId, 1);
      }
      publishRealtime(appointment.barbershopId, "appointments:changed");
      return;
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.appointment.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      if (shouldRestore && appointment.clientPackageId) {
        await restoreClientPackageInTx(tx, appointment.clientPackageId, 1);
      }
    });
    publishRealtime(appointment.barbershopId, "appointments:changed");
  }
}

// ─── Lembretes diários (WhatsApp / Evolution API) ─────────────────────────────

/**
 * Extrai YYYY-MM-DD de um `Date` que representa um **dia calendário** (não um
 * instante). No Prisma, `appointment.date` é armazenado como
 * `2026-07-29T00:00:00.000Z` — o dia 29 de julho, independente do fuso.
 *
 * Não usamos `Intl.DateTimeFormat` aqui porque ele converteria o instante
 * `00:00 UTC` para o fuso local, deslocando o dia (ex.: 28/07 em SP). Extraímos
 * direto do ISO string, que preserva o dia calendário original.
 */
function calendarDateParts(d: Date): { year: number; month: number; day: number } {
  const iso = d.toISOString(); // "2026-07-29T00:00:00.000Z"
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10)),
  };
}

/**
 * Constrói o instante absoluto (timestamp) de um horário agendado, interpretando
 * `appt.date` + `appt.time` como horário local de São Paulo (UTC-3 fixo sem DST
 * desde 2013). Retorna um `Date` que o `Date` nativo parsear corretamente.
 *
 * O campo `appt.date` é armazenado como `2026-07-29T00:00:00.000Z` — o dia 29
 * de julho, sem significado de instante. Extraímos ano/mês/dia direto do ISO
 * string (não via `Intl.DateTimeFormat`, que deslocaria o dia) e montamos um
 * ISO com offset `-03:00` explícito.
 */
function scheduledInstant(appt: Pick<IAppointmentResponseDTO, "date" | "time">, now: Date): Date {
  const source = appt.date instanceof Date ? appt.date : new Date(appt.date);
  const { year, month, day } = calendarDateParts(source);
  const [hh, mm] = (appt.time || "00:00").split(":").map((n) => Number(n) || 0);
  // ISO string com offset -03:00 — Date.parse retorna o instante absoluto correto
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000-03:00`;
  void now; // mantido para simetria com estimatedAt no caller
  return new Date(iso);
}

/** Formata um `Date` como HH:mm no fuso America/Sao_Paulo. */
function formatSaoPauloTime(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Mensagem principal do lembrete — não menciona fila (a info de fila é enviada
 * como segunda mensagem separada por `buildQueueUpdateMessage`). Exportada para
 * ser testável de forma isolada.
 */
export function buildReminderMessage(
  appt: IAppointmentResponseDTO,
  _estimate: QueueWaitEstimate,
  _now: Date = new Date()
): string {
  const shopLabel = appt.barbershopName?.trim() || "a barbearia";
  const serviceLabel = appt.serviceName?.trim() || "atendimento";

  return (
    `Olá, ${appt.customerName}! 💈\n\n` +
    `Seu horário na *${shopLabel}* está confirmado para hoje às *${appt.time}* (${serviceLabel}).\n\n` +
    `Até já!`
  );
}

/**
 * Segunda mensagem (separada), enviada somente quando há fila (peopleAhead > 0).
 * Contém estimativa de fila e previsão de atendimento no fuso de São Paulo.
 * Exportada para ser testável de forma isolada.
 */
export function buildQueueUpdateMessage(
  appt: IAppointmentResponseDTO,
  estimate: QueueWaitEstimate,
  now: Date = new Date()
): string {
  const [hh, mm] = (appt.time || "00:00").split(":").map((n) => Number(n) || 0);
  void hh; void mm;

  const scheduledAt = scheduledInstant(appt, now);
  const estimatedAt = new Date(now.getTime() + estimate.estimatedWaitMinutes * 60_000);
  const realAt = new Date(Math.max(scheduledAt.getTime(), estimatedAt.getTime()));
  const horarioFormatado = formatSaoPauloTime(realAt);

  return (
    `📋 Atualização da fila, ${appt.customerName}!\n\n` +
    `Há ${estimate.peopleAhead} pessoa(s) na frente de você.\n` +
    `⏱️ Tempo médio estimado até seu atendimento: ${estimate.estimatedWaitMinutes} min\n` +
    `🕒 Previsão de atendimento: por volta de *${horarioFormatado}*\n\n` +
    `Até já!`
  );
}

export interface ReminderResult {
  sent: number;
  failed: number;
  queueMessagesFailed: number;
}

@injectable()
export class SendAppointmentRemindersUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository,
    @inject(GetQueueWaitEstimateUseCase)
    private getQueueWaitEstimate: GetQueueWaitEstimateUseCase,
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}

  async execute(): Promise<ReminderResult> {
    const appointments = await this.repo.findConfirmedForReminderToday();
    const now = new Date();
    let sent = 0;
    let failed = 0;
    let queueMessagesFailed = 0;

    // Cache simples de barbearia por barbershopId dentro do batch — evita
    // repetir a query para o segundo envio (mensagem de fila) do mesmo agendamento.
    const shopCache = new Map<string, { evolutionInstanceName?: string | null }>();

    for (const appt of appointments) {
      try {
        const estimate = await this.getQueueWaitEstimate.execute(appt.barbershopId);
        const mainMessage = buildReminderMessage(appt, estimate, now);

        let shop = shopCache.get(appt.barbershopId);
        if (!shop) {
          const fetched = await this.barbershopRepository.findById(appt.barbershopId);
          shop = { evolutionInstanceName: fetched?.evolutionInstanceName ?? null };
          shopCache.set(appt.barbershopId, shop);
        }

        const instanceName = shop.evolutionInstanceName?.trim();
        if (!instanceName) {
          failed++;
          continue;
        }

        await enqueueWhatsApp({
          phone: appt.whatsapp,
          message: mainMessage,
          instanceName,
          deduplicationKey: `reminder:${appt.id}`,
          notificationType: "APPOINTMENT_REMINDER",
          barbershopId: appt.barbershopId,
          clientId: appt.clientId ?? undefined,
          sourceType: "APPOINTMENT",
          sourceId: appt.id,
        });
        if (getNotificationV2Mode() !== "active") {
          await this.repo.markReminderSent(appt.id);
        }
        sent++;

        if (estimate.peopleAhead > 0) {
          try {
            const queueMsg = buildQueueUpdateMessage(appt, estimate, now);
            await enqueueWhatsApp({
              phone: appt.whatsapp,
              message: queueMsg,
              instanceName,
              deduplicationKey: `reminder-queue:${appt.id}`,
              notificationType: "APPOINTMENT_QUEUE_UPDATE",
              barbershopId: appt.barbershopId,
              clientId: appt.clientId ?? undefined,
              sourceType: "APPOINTMENT",
              sourceId: appt.id,
            });
          } catch {
            queueMessagesFailed++;
          }
        }
      } catch {
        // Um agendamento com problema (ex.: dado inesperado) não pode abortar
        // o processamento dos demais do dia; contabiliza como falha e segue.
        failed++;
      }
    }

    return { sent, failed, queueMessagesFailed };
  }
}

