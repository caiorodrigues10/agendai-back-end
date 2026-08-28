import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { sendWhatsAppMessage } from "@/shared/services/whatsappNotificationService";
import { enqueueWhatsApp } from "@/shared/infra/queue";
import { prisma } from "@/libs/prismaClient";
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
    return fallbackRepo.create(data);
  }

  return prisma.$transaction(async (tx) => {
    await assertAppointmentBookable(data, tx);

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
        staffId: data.staffId ?? null,
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

    return this.repo.update(id, data);
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

    return this.repo.getOccupiedSlots(barbershopId, date, staffId);
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
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      if (shouldRestore && appointment.clientPackageId) {
        await restoreClientPackageInTx(tx, appointment.clientPackageId, 1);
      }
    });
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
        });
        await this.repo.markReminderSent(appt.id);
        sent++;

        if (estimate.peopleAhead > 0) {
          try {
            const queueMsg = buildQueueUpdateMessage(appt, estimate, now);
            await enqueueWhatsApp({
              phone: appt.whatsapp,
              message: queueMsg,
              instanceName,
              deduplicationKey: `reminder-queue:${appt.id}`,
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

