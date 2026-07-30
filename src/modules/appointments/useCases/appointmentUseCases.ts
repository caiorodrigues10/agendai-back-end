import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { sendWhatsAppMessage } from "@/shared/services/whatsappNotificationService";
import { IAppointmentRepository } from "../repositories/IAppointmentRepository";
import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import {
  ICreateAppointmentDTO,
  IUpdateAppointmentDTO,
  IAppointmentResponseDTO,
  IListAppointmentsQuery,
  IAvailabilitySlotDTO,
} from "../dtos/IAppointmentDTO";
import {
  GetQueueWaitEstimateUseCase,
  QueueWaitEstimate,
} from "@/modules/queue/useCases/getQueueWaitEstimate/GetQueueWaitEstimateUseCase";

// ─── Create ───────────────────────────────────────────────────────────────────

@injectable()
export class CreateAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
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
    return this.repo.create(data);
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

  /** Rota pública: retorna slots OCUPADOS do dia; o front calcula os livres. */
  async execute(
    barbershopId: string,
    date: string
  ): Promise<IAvailabilitySlotDTO[]> {
    return this.repo.getOccupiedSlots(barbershopId, date);
  }
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

@injectable()
export class CancelAppointmentUseCase {
  constructor(
    @inject("AppointmentRepository")
    private repo: IAppointmentRepository
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

    await this.repo.delete(id);
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

        const sendOpts = {
          instanceName: shop.evolutionInstanceName ?? undefined,
        };

        const ok = await sendWhatsAppMessage(appt.whatsapp, mainMessage, sendOpts);
        if (!ok) {
          failed++;
          continue;
        }

        await this.repo.markReminderSent(appt.id);
        sent++;

        if (estimate.peopleAhead > 0) {
          try {
            const queueMsg = buildQueueUpdateMessage(appt, estimate, now);
            const queueOk = await sendWhatsAppMessage(appt.whatsapp, queueMsg, sendOpts);
            if (!queueOk) {
              queueMessagesFailed++;
            }
          } catch {
            // A mensagem principal já foi enviada com sucesso — a falha da
            // segunda mensagem não derruba o contador de sent.
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

