import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { OwnerBotRepository } from "./ownerBotRepository";
import { hasOwnerBotAccess } from "./ownerBotSubscription";
import { createOwnerBotActions, type OwnerBotActions } from "./ownerBotActions";
import type { OwnerBotMessenger } from "./ownerBotMessenger";
import { EvolutionOwnerBotMessenger } from "./ownerBotMessenger";
import { getShopTimezone } from "@/modules/financial/ledger/shopTime";
import { maskPhone } from "./messages";
import { getModuleLogger } from "@/shared/utils/logger";
import { formatBRL } from "./commands/money";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Push proativo do assistente: briefing de manhã e resumo de noite.
 *
 * Só envia para números dono vinculados, respeitando as preferências por
 * salão (briefingEnabled/summaryEnabled) e a hora no fuso do salão.
 * Idempotente por dia via lastBriefingAt/lastSummaryAt.
 */

const logger = getModuleLogger("owner-bot:push");

export type OwnerBotPushDeps = {
  repo?: OwnerBotRepository;
  messenger?: OwnerBotMessenger;
  actions?: OwnerBotActions;
  hasAccess?: (barbershopId: string) => Promise<boolean>;
  now?: () => Date;
  getTimezone?: (barbershopId: string) => Promise<string>;
};

type PushPreferenceRow = {
  barbershopId: string;
  briefingEnabled: boolean;
  briefingTime: string;
  summaryEnabled: boolean;
  summaryTime: string;
  lastBriefingAt?: Date | null;
  lastSummaryAt?: Date | null;
};

export class OwnerBotPushService {
  private repo: OwnerBotRepository;
  private messenger: OwnerBotMessenger;
  private actions: OwnerBotActions;
  private hasAccess: (barbershopId: string) => Promise<boolean>;
  private now: () => Date;
  private getTimezone: (barbershopId: string) => Promise<string>;

  constructor(deps: OwnerBotPushDeps = {}) {
    this.repo = deps.repo ?? new OwnerBotRepository();
    this.messenger = deps.messenger ?? new EvolutionOwnerBotMessenger();
    this.actions = deps.actions ?? createOwnerBotActions();
    this.hasAccess = deps.hasAccess ?? hasOwnerBotAccess;
    this.now = deps.now ?? (() => new Date());
    this.getTimezone = deps.getTimezone ?? getShopTimezone;
  }

  /**
   * Varre as preferências ativas e envia briefing/resumo para quem está na
   * hora certa no fuso do salão. Idempotente por dia (lastBriefingAt).
   */
  async runDuePushes(): Promise<{ briefing: number; summary: number; skipped: number }> {
    const prefs = (await this.repo.listEnabledPreferences()) as PushPreferenceRow[];
    let briefing = 0;
    let summary = 0;
    let skipped = 0;

    for (const row of prefs) {
      try {
        const timezone = await this.getTimezone(row.barbershopId);
        const local = dayjs(this.now()).tz(timezone);
        const hour = local.format("HH:mm");
        const localDay = local.format("YYYY-MM-DD");

        const briefingDue =
          row.briefingEnabled && row.briefingTime === hour && !this.sentToday(row.lastBriefingAt, localDay);
        const summaryDue =
          row.summaryEnabled && row.summaryTime === hour && !this.sentToday(row.lastSummaryAt, localDay);

        if (!briefingDue && !summaryDue) {
          skipped += 1;
          continue;
        }

        if (!(await this.hasAccess(row.barbershopId))) {
          skipped += 1;
          continue;
        }

        if (briefingDue) {
          const sent = await this.sendBriefing(row.barbershopId, timezone);
          if (sent) briefing += 1;
          await this.repo.markPushSent(row.barbershopId, "briefing", this.now());
        }

        if (summaryDue) {
          const sent = await this.sendSummary(row.barbershopId, timezone);
          if (sent) summary += 1;
          await this.repo.markPushSent(row.barbershopId, "summary", this.now());
        }
      } catch (err) {
        logger.warn({ err, barbershopId: row.barbershopId }, "Falha ao enviar push do assistente");
        skipped += 1;
      }
    }

    return { briefing, summary, skipped };
  }

  private sentToday(lastAt: Date | null | undefined, localDay: string): boolean {
    if (!lastAt) return false;
    return dayjs(lastAt).format("YYYY-MM-DD") === localDay;
  }

  private async sendBriefing(barbershopId: string, timezone: string): Promise<boolean> {
    const today = dayjs(this.now()).tz(timezone).format("YYYY-MM-DD");
    const appointments = await this.actions.listAppointments(barbershopId, today);
    const active = appointments.filter((item) => item.status !== "CANCELLED");

    const lines = [
      `Bom dia! ☀️ Hoje você tem ${active.length} ${
        active.length === 1 ? "atendimento" : "atendimentos"
      }.`,
    ];
    if (active.length) {
      lines.push("");
      for (const item of active.slice(0, 10)) {
        lines.push(
          `• ${item.time} — ${item.customerName}${item.serviceName ? ` (${item.serviceName})` : ""}`
        );
      }
      if (active.length > 10) lines.push(`… e mais ${active.length - 10}.`);
    } else {
      lines.push('Agenda livre. Quer encaixar alguém? Me chame com "agendar".');
    }

    return this.sendToOwners(barbershopId, lines.join("\n"));
  }

  private async sendSummary(barbershopId: string, timezone: string): Promise<boolean> {
    const today = dayjs(this.now()).tz(timezone).format("YYYY-MM-DD");
    const figures = await this.actions.dayFigures(barbershopId, today);
    const total = figures.cashReceived + figures.pixReceived + figures.cardReceived;

    const lines = [
      "Resumo do dia 🌙",
      `• Entradas: ${formatBRL(total)}`,
      `• Dinheiro: ${formatBRL(figures.cashReceived)} · Pix: ${formatBRL(figures.pixReceived)} · Cartão: ${formatBRL(figures.cardReceived)}`,
      `• Despesas: ${formatBRL(figures.expenses)}`,
      `• Comissões: ${formatBRL(figures.commissions)}`,
    ];

    return this.sendToOwners(barbershopId, lines.join("\n"));
  }

  private async sendToOwners(barbershopId: string, text: string): Promise<boolean> {
    const phones = await this.repo.findActiveOwnerPhonesByShop(barbershopId);
    if (!phones.length) return false;

    let sentAny = false;
    for (const phone of phones) {
      try {
        const sent = await this.messenger.send(phone, text);
        if (sent) sentAny = true;
        else logger.warn({ phone: maskPhone(phone) }, "Push do assistente não enviado");
      } catch (err) {
        logger.warn({ err, phone: maskPhone(phone) }, "Erro ao enviar push do assistente");
      }
    }
    return sentAny;
  }
}

/** Roda uma vez (usado pelo cron). */
export async function runOwnerBotPushes(): Promise<{ briefing: number; summary: number; skipped: number }> {
  const service = new OwnerBotPushService();
  return service.runDuePushes();
}
