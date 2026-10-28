import type { BusinessSegment } from "@prisma/client";
import { normalizeWhatsAppPhone } from "@/shared/services/evolutionApiService";
import { getModuleLogger } from "@/shared/utils/logger";
import { AppError } from "@/shared/errors/AppError";
import { hashOwnerBotLinkCode, verifyOwnerBotLinkCode } from "./linkCode";
import {
  formatDateLabel,
  formatRelativeDateLabel,
  maskPhone,
  OWNER_BOT_MESSAGES,
} from "./messages";
import { parseOwnerBotIntent } from "./intentParser";
import { parseOwnerBotDate, parseOwnerBotTime, todayInSaoPaulo, normalizeText } from "./dateParser";
import {
  getOwnerBotLabels,
  getOwnerBotSegmentProfile,
  ownerBotSupports,
} from "./segmentProfiles";
import { OwnerBotRepository } from "./ownerBotRepository";
import { createOwnerBotStore, type OwnerBotStore } from "./ownerBotStore";
import {
  EvolutionOwnerBotMessenger,
  type OwnerBotMessenger,
} from "./ownerBotMessenger";
import {
  createOwnerBotActions,
  type OwnerBotActions,
  type OwnerBotActor,
} from "./ownerBotActions";
import { hasOwnerBotAccess } from "./ownerBotSubscription";
import { getOwnerBotPreferences, type OwnerBotPreferences } from "./ownerBotPreferences";
import {
  OWNER_BOT_COMMANDS,
  getOwnerBotCommand,
  matchOwnerBotCommand,
  buildOwnerBotSegmentCatalog,
  OWNER_BOT_CATEGORY_LABELS,
} from "./commands/registry";
import {
  resolveOwnerBotPeriod,
} from "./commands/periods";
import {
  extractOwnerBotAmount,
  extractOwnerBotPersonName,
  extractOwnerBotServiceName,
  extractOwnerBotSubject,
} from "./commands/extractors";
import { truncateMessage } from "./commands/helpers";
import type {
  OwnerBotCommand,
  OwnerBotCommandContext,
  OwnerBotCommandOutcome,
  OwnerBotEntities,
  OwnerBotPeriod,
} from "./commands/types";
import type {
  OwnerBotConversationState,
  OwnerBotFlow,
  OwnerBotIncomingMessage,
  OwnerBotIntent,
  OwnerBotLinkContext,
} from "./types";

/**
 * Assistente de WhatsApp do dono.
 *
 * Regras que valem para tudo:
 * - o número que escreve precisa ser o telefone cadastrado no estabelecimento;
 * - toda ação que grava passa pelos use cases do app (nada de SQL solto);
 * - LEITURA executa direto; ESCRITA pede "1-Sim 2-Não"; SENSÍVEL pede
 *   "CONFIRMAR" — nunca executa no escuro;
 * - tudo o que acontece fica registrado em `owner_bot_action_logs`.
 */

const logger = getModuleLogger("owner-bot:service");

const MEMORY_TTL_MS = 30 * 60 * 1000;
const UNDO_TTL_MS = 2 * 60 * 1000;

/** Comandos de escrita cuja ação pode ser desfeita com segurança. */
const UNDOABLE_COMMANDS: Record<string, (ctx: OwnerBotCommandContext, affectedIds: string[]) => Promise<string>> = {
  "fin.expense.create": async (ctx, affectedIds) => {
    await ctx.actions.deleteExpense(affectedIds[0] ?? "", ctx.actor);
    return "Despesa apagada.";
  },
  "account.block": async (ctx) => {
    await ctx.actions.updatePreferences(ctx.actor.barbershopId, { blocked: false });
    return "Assistente reativado.";
  },
};

export type OwnerBotServiceDeps = {
  repo?: OwnerBotRepository;
  store?: OwnerBotStore;
  messenger?: OwnerBotMessenger;
  actions?: OwnerBotActions;
  hasAccess?: (barbershopId: string) => Promise<boolean>;
  now?: () => Date;
};

type ActiveLink = Awaited<ReturnType<OwnerBotRepository["findActiveLinksByPhone"]>>[number];

type AppointmentAction = "CANCEL" | "RESCHEDULE" | "CHECK_IN" | "COMPLETE" | "NO_SHOW";

export class OwnerBotService {
  private repo: OwnerBotRepository;
  private store: OwnerBotStore;
  private messenger: OwnerBotMessenger;
  private actions: OwnerBotActions;
  private hasAccess: (barbershopId: string) => Promise<boolean>;
  private now: () => Date;

  constructor(deps: OwnerBotServiceDeps = {}) {
    this.repo = deps.repo ?? new OwnerBotRepository();
    this.store = deps.store ?? createOwnerBotStore();
    this.messenger = deps.messenger ?? new EvolutionOwnerBotMessenger();
    this.actions = deps.actions ?? createOwnerBotActions();
    this.hasAccess = deps.hasAccess ?? hasOwnerBotAccess;
    this.now = deps.now ?? (() => new Date());
  }

  // ─── Entrada ───────────────────────────────────────────────────────────────

  async handleIncoming(message: OwnerBotIncomingMessage): Promise<void> {
    const phone = normalizeWhatsAppPhone(message.phone ?? "");
    const text = (message.text ?? "").trim();
    if (!phone || !text) return;

    // Idempotência: a Evolution reenvia a mesma mensagem (key.id) em retries.
    if (await this.store.markMessageSeen(message.messageId)) return;

    const intent = parseOwnerBotIntent(text);
    const links = await this.repo.findActiveLinksByPhone(phone);

    if (intent.type === "LINK_CODE") {
      await this.handleLinkCode(phone, intent.code, links);
      return;
    }

    if (!links.length) {
      // Anti-spam: número desconhecido responde no máximo uma vez a cada 10 min.
      if (await this.store.allowUnlinkedReply(phone)) {
        await this.reply(phone, OWNER_BOT_MESSAGES.notLinked());
      }
      return;
    }

    const state = (await this.store.getState(phone)) ?? { updatedAt: this.now().getTime() };
    const context = await this.resolveContext(phone, links, state);
    if (!context) return;

    await this.repo.touchLink(context.linkId).catch(() => undefined);

    // Feature flag global (desligar rápido em produção).
    if (process.env.OWNER_BOT_ENABLED === "false") {
      await this.reply(phone, "O assistente está temporariamente indisponível.");
      return;
    }

    const preferences = await getOwnerBotPreferences(this.repo, context.barbershopId);
    if (preferences.blocked) {
      if (await this.store.allowUnlinkedReply(`blocked:${phone}`)) {
        await this.reply(
          phone,
          "O assistente está bloqueado para este estabelecimento. Reative pela seção do app (Configurações > Assistente no WhatsApp)."
        );
      }
      return;
    }
    if (!preferences.enabled) {
      await this.reply(phone, "O assistente está desativado para este estabelecimento.");
      return;
    }
    if (!(await this.hasAccess(context.barbershopId))) {
      await this.reply(phone, OWNER_BOT_MESSAGES.subscriptionBlocked());
      return;
    }

    // Escolha de unidade (multi-unidade) vem antes do fluxo.
    if (intent.type === "SELECT" && state.lastList?.kind === "SHOPS") {
      await this.selectShop(context, state, intent.index, phone);
      return;
    }

    if (state.flow) {
      const consumed = await this.continueFlow(context, state, intent, text, phone, preferences);
      if (consumed) return;
    }

    await this.dispatchMessage(context, state, intent, text, phone, preferences);
  }

  // ─── Vínculo ───────────────────────────────────────────────────────────────

  private async handleLinkCode(
    phone: string,
    code: string,
    links: ActiveLink[]
  ): Promise<void> {
    const codeHash = hashOwnerBotLinkCode(code);
    const pending = await this.repo.findPendingLinkCode(codeHash);

    if (!pending) {
      await this.reply(phone, OWNER_BOT_MESSAGES.linkInvalidCode());
      return;
    }

    // Comparação em tempo constante com o hash gravado.
    if (!verifyOwnerBotLinkCode(code, pending.codeHash)) {
      await this.reply(phone, OWNER_BOT_MESSAGES.linkInvalidCode());
      return;
    }

    if (pending.expiresAt.getTime() <= this.now().getTime()) {
      await this.repo.incrementLinkCodeAttempts(pending.id);
      await this.reply(phone, OWNER_BOT_MESSAGES.linkInvalidCode());
      return;
    }

    if (pending.attempts >= pending.maxAttempts) {
      await this.reply(phone, OWNER_BOT_MESSAGES.linkTooManyAttempts());
      return;
    }

    const shop = await this.repo.findShop(pending.barbershopId);
    if (!shop || !shop.active) {
      await this.reply(phone, OWNER_BOT_MESSAGES.linkInvalidCode());
      return;
    }

    const owner = await this.repo.findUser(pending.userId);
    if (!owner || !owner.active) {
      await this.reply(phone, OWNER_BOT_MESSAGES.linkInvalidCode());
      return;
    }

    // O número que escreve tem que ser o telefone cadastrado no salão.
    const shopPhone = normalizeWhatsAppPhone(shop.whatsapp ?? "");
    if (!shopPhone || shopPhone !== phone) {
      await this.reply(
        phone,
        OWNER_BOT_MESSAGES.linkPhoneMismatch(maskPhone(shopPhone || phone))
      );
      return;
    }

    if (!(await this.hasAccess(shop.id))) {
      await this.reply(phone, OWNER_BOT_MESSAGES.subscriptionBlocked());
      return;
    }

    const existing = await this.repo.findActiveLinkByPhoneAndShop(phone, shop.id);
    if (existing) {
      await this.repo.consumeLinkCode(pending.id);
      await this.reply(phone, OWNER_BOT_MESSAGES.alreadyLinked(shop.name));
      return;
    }

    // Um número pertence a um dono: vínculos de outros donos são revogados.
    await this.repo.revokeLinksOfOtherUsers(phone, pending.userId);
    await this.repo.createLink({
      userId: pending.userId,
      barbershopId: shop.id,
      normalizedPhone: phone,
    });
    await this.repo.consumeLinkCode(pending.id);

    await this.repo
      .logAction({
        barbershopId: shop.id,
        userId: pending.userId,
        phoneMasked: maskPhone(phone),
        action: "LINK",
        status: "SUCCESS",
        request: { linked: true },
      })
      .catch(() => undefined);

    await this.store.clearState(phone);
    await this.reply(
      phone,
      OWNER_BOT_MESSAGES.linkSuccess(shop.name, owner.name, maskPhone(phone))
    );
  }

  // ─── Contexto ──────────────────────────────────────────────────────────────

  private toContext(link: ActiveLink): OwnerBotLinkContext {
    return {
      linkId: link.id,
      userId: link.userId,
      barbershopId: link.barbershopId,
      barbershopName: link.barbershop.name,
      normalizedPhone: link.normalizedPhone,
      segment: link.barbershop.businessSegment ?? "OTHER",
      ownerName: link.user.name,
    };
  }

  /** Define a unidade ativa. Com mais de uma, pergunta ao dono qual é. */
  private async resolveContext(
    phone: string,
    links: ActiveLink[],
    state: OwnerBotConversationState
  ): Promise<OwnerBotLinkContext | null> {
    const active = state.activeShopId
      ? links.find((link) => link.barbershopId === state.activeShopId)
      : undefined;
    if (active) return this.toContext(active);

    if (links.length === 1) {
      state.activeShopId = links[0].barbershopId;
      await this.saveState(phone, state);
      return this.toContext(links[0]);
    }

    state.lastList = {
      kind: "SHOPS",
      items: links.map((link) => ({ id: link.barbershopId, label: link.barbershop.name })),
    };
    await this.saveState(phone, state);
    await this.reply(
      phone,
      `Você tem ${links.length} unidades vinculadas. Qual delas?\n${links
        .map((link, index) => `${index + 1}. ${link.barbershop.name}`)
        .join("\n")}`
    );
    return null;
  }

  private async selectShop(
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    index: number,
    phone: string
  ): Promise<void> {
    const item = state.lastList?.items[index - 1];
    if (!item) {
      await this.reply(phone, OWNER_BOT_MESSAGES.invalidSelection());
      return;
    }
    state.activeShopId = item.id;
    state.lastList = undefined;
    await this.saveState(phone, state);
    await this.reply(phone, OWNER_BOT_MESSAGES.switchShop(item.label));
  }

  // ─── Dispatch por registry ────────────────────────────────────────────────

  private async dispatchMessage(
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    intent: OwnerBotIntent,
    raw: string,
    phone: string,
    preferences: OwnerBotPreferences
  ): Promise<void> {
    // Saudação e ajuda continuam sendo intents curtos (tolerância a "oi").
    if (intent.type === "GREETING") {
      await this.reply(
        phone,
        OWNER_BOT_MESSAGES.welcome(context.barbershopName, context.ownerName)
      );
      return;
    }

    if (intent.type === "SWITCH_SHOP") {
      await this.listShops(context, state, phone);
      return;
    }

    if (intent.type === "SELECT" && state.lastList?.kind === "COMMANDS") {
      await this.showCategory(context, state, intent.index, phone);
      return;
    }

    // "desfazer" (janela de 2 minutos).
    if (/\b(desfazer|desfaz|voltar atras|voltar atrás)\b/.test(normalizeText(raw))) {
      await this.handleUndo(context, state, phone);
      return;
    }

    const text = normalizeText(raw).replace(/\s+/g, " ");
    const entities = this.buildEntities(raw, context, state);
    const match = matchOwnerBotCommand(raw, OWNER_BOT_COMMANDS, context.segment);

    if (match.best) {
      await this.runCommand(match.best.command, context, state, entities, phone, preferences);
      return;
    }

    if (match.alternatives.length) {
      await this.askDisambiguation(match.alternatives, state, phone);
      return;
    }

    // Sem comando: memória curta (follow-ups como "e amanhã?").
    const remembered = this.recallMemory(state, entities);
    if (remembered) {
      const command = getOwnerBotCommand(remembered.commandId);
      if (command && command.risk === "READ") {
        await this.runCommand(command, context, state, remembered.entities, phone, preferences);
        return;
      }
    }

    await this.reply(
      phone,
      `${OWNER_BOT_MESSAGES.unknown()}\n\nExemplos: "agenda de hoje", "faturamento do mês", "quem é a Maria?", "menu".`
    );
  }

  private async showCategory(
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    index: number,
    phone: string
  ): Promise<void> {
    const item = state.lastList?.items[index - 1];
    if (!item) {
      await this.reply(phone, OWNER_BOT_MESSAGES.invalidSelection());
      return;
    }
    state.lastList = undefined;
    await this.saveState(phone, state);

    const catalog = buildOwnerBotSegmentCatalog(OWNER_BOT_COMMANDS, context.segment);
    const category = catalog.categories.find(
      (entry) => entry.id === item.id || entry.label === item.label
    );
    if (!category) {
      await this.reply(phone, OWNER_BOT_MESSAGES.invalidSelection());
      return;
    }

    const lines = category.commands.map(
      (command) => `• ${command.description}: "${command.examples[0]}"`
    );
    await this.reply(
      phone,
      `${category.label} — o que dá para pedir:\n${lines.join("\n")}\n\nPode escrever do seu jeito.`
    );
  }

  private async askDisambiguation(
    alternatives: Array<{ command: OwnerBotCommand; score: number }>,
    state: OwnerBotConversationState,
    phone: string
  ): Promise<void> {
    const unique = alternatives.filter(
      (item, index, arr) => arr.findIndex((other) => other.command.id === item.command.id) === index
    );
    if (!unique.length) {
      await this.reply(
        phone,
        "Não entendi. Envie \"menu\" para ver as categorias ou \"ajuda\" para exemplos."
      );
      return;
    }

    state.lastList = {
      kind: "COMMANDS",
      items: unique.map((item) => ({
        id: item.command.id,
        label: `${item.command.description} ("${item.command.examples[0]}")`,
      })),
    };
    await this.saveState(phone, state);
    await this.reply(
      phone,
      `Você quis dizer:\n${unique
        .map((item, index) => `${index + 1}. ${item.command.description}`)
        .join("\n")}\n\nResponda com o número.`
    );
  }

  /** Executa um comando do registry com a classe de risco respeitada. */
  private async runCommand(
    command: OwnerBotCommand,
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    entities: OwnerBotEntities,
    phone: string,
    preferences: OwnerBotPreferences,
    confirmed = false
  ): Promise<void> {
    // Teto de escritas por minuto (só para ações que alteram algo).
    // Conta o pedido e a execução confirmada — senão a confirmação livra o teto.
    if (command.risk !== "READ") {
      if (!(await this.store.allowWriteAction(phone))) {
        if (state.flow) {
          state.flow = undefined;
          state.lastList = undefined;
          await this.saveState(phone, state);
        }
        await this.reply(
          phone,
          "Muitas ações em pouco tempo. Aguarde um minuto e tente de novo."
        );
        return;
      }
    }

    const ctx = this.buildCommandContext(context, state, entities, preferences, confirmed);

    let outcome;
    try {
      outcome = await command.run(ctx, entities);
    } catch (error: unknown) {
      const message = error instanceof AppError ? error.message : "não consegui concluir agora";
      await this.log(context, phone, command.id, command.risk, entities, "ERROR", message);
      await this.reply(phone, `Não consegui concluir: ${message}. Tente de novo ou use "ajuda".`);
      return;
    }

    // Fluxo legado (agendar/cancelar/etc.): encaminha para o fluxo multi-passo.
    if (outcome.flow && outcome.flow.kind !== "COMMAND") {
      await this.startLegacyFlow(context, state, outcome.flow, outcome.list, phone);
      return;
    }

    if (outcome.flow?.kind === "COMMAND") {
      const flow: OwnerBotFlow = {
        kind: "COMMAND",
        step: outcome.flow.step,
        commandId: command.id,
        entities: { ...entities } as Record<string, unknown>,
        riskClass: command.risk,
        ...(outcome.confirmation ? { confirmationSummary: outcome.confirmation.summary } : {}),
      };
      state.flow = flow;
      if (outcome.list) state.lastList = outcome.list;
      else state.lastList = undefined;
      await this.saveState(phone, state);
      await this.reply(phone, outcome.text);
      return;
    }

    if (outcome.confirmation && !confirmed) {
      // ESCRITA: resumo + "1-Sim 2-Não". SENSÍVEL: "digite CONFIRMAR".
      state.flow = {
        kind: "COMMAND",
        step: "CONFIRM",
        commandId: command.id,
        entities: { ...entities } as Record<string, unknown>,
        riskClass: command.risk,
        confirmationSummary: outcome.confirmation.summary,
      };
      await this.saveState(phone, state);
      const suffix =
        command.risk === "SENSITIVE"
          ? "\n\n⚠️ Esta ação é sensível. Para confirmar, digite CONFIRMAR."
          : "";
      await this.reply(phone, `${outcome.text}${suffix}`);
      return;
    }

    await this.finishCommand(command, context, state, entities, outcome, phone);
  }

  private async finishCommand(
    command: OwnerBotCommand,
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    entities: OwnerBotEntities,
    outcome: OwnerBotCommandOutcome,
    phone: string
  ): Promise<void> {
    state.flow = undefined;
    state.lastList = outcome.list ? (outcome.list as OwnerBotConversationState["lastList"]) : undefined;
    state.memory = {
      commandId: command.id,
      entities: { ...entities } as Record<string, unknown>,
      at: this.now().getTime(),
    };

    const canUndo = command.risk === "WRITE" && Boolean(UNDOABLE_COMMANDS[command.id]);
    const logId = await this.logCommand(context, phone, command, entities, outcome, canUndo);
    if (canUndo) {
      state.undo = {
        logId,
        commandId: command.id,
        affectedIds: outcome.affectedIds ?? [],
        at: this.now().getTime(),
      };
    }
    await this.saveState(phone, state);

    const parts = [outcome.text];
    if (outcome.suggestions?.length) {
      parts.push(`\nQuer ver ${outcome.suggestions[0]}?`);
    }
    await this.reply(phone, parts.join(""));
  }

  /** Encaminha o fluxo legado devolvido por appointment.* e waitlist.*. */
  private async startLegacyFlow(
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    flow: OwnerBotFlow,
    list: OwnerBotConversationState["lastList"] | { kind: never; items: never[] } | undefined,
    phone: string
  ): Promise<void> {
    switch (flow.kind) {
      case "SCHEDULE":
        await this.startServiceStep(context, state, "SCHEDULE", phone);
        return;
      case "WALK_IN":
        await this.startServiceStep(context, state, "WALK_IN", phone);
        return;
      case "CANCEL":
      case "RESCHEDULE":
      case "CHECK_IN":
      case "COMPLETE":
      case "NO_SHOW":
        await this.startAppointmentAction(context, state, flow.kind, phone);
        return;
      case "UNLINK":
        await this.startUnlinkFlow(context, state, phone);
        return;
      default: {
        // Fluxos já com lista própria (waitlist, lembrete, mensagem ao cliente).
        state.flow = flow;
        state.lastList = list as OwnerBotConversationState["lastList"];
        await this.saveState(phone, state);
        if (flow.step === "CLIENT_MESSAGE_TEXT") {
          await this.reply(phone, flow.clientName ? `O que devo mandar para ${flow.clientName}?` : "Qual mensagem devo enviar?");
          return;
        }
        if (flow.step === "WAITLIST_DATE") {
          await this.reply(phone, 'Para que dia? Responda "hoje", "amanha" ou dd/mm.');
          return;
        }
        if (flow.step === "WAITLIST_CONFIRM") {
          const label = state.lastList?.items[0]?.label ?? "este item";
          await this.reply(phone, OWNER_BOT_MESSAGES.askConfirmation(label));
          return;
        }
        if (flow.step === "REMINDER_CONFIRM") {
          await this.reply(phone, OWNER_BOT_MESSAGES.appointmentsHeader("enviar o lembrete"));
          return;
        }
        await this.reply(phone, "Como posso ajudar?");
      }
    }
  }

  // ─── Fluxos ────────────────────────────────────────────────────────────────

  private async startServiceStep(
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    kind: "SCHEDULE" | "WALK_IN",
    phone: string
  ): Promise<void> {
    if (!ownerBotSupports(context.segment, kind === "SCHEDULE" ? "SCHEDULE" : "WALK_IN")) {
      await this.reply(phone, "Essa ação não está disponível para este tipo de estabelecimento.");
      return;
    }
    const services = await this.actions.listServices(context.barbershopId);
    if (!services.length) {
      await this.reply(phone, "Não há serviços cadastrados neste estabelecimento.");
      return;
    }
    state.flow = { kind, step: "SERVICE" };
    state.lastList = {
      kind: "SERVICES",
      items: services.map((service) => ({ id: service.id, label: service.name })),
    };
    await this.saveState(phone, state);
    const labels = getOwnerBotLabels(context.segment);
    await this.reply(
      phone,
      `${OWNER_BOT_MESSAGES.servicesHeader(labels.service)}\n${services
        .map((service, index) => OWNER_BOT_MESSAGES.serviceItem(index + 1, service.name))
        .join("\n")}`
    );
  }

  private async startAppointmentAction(
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    kind: AppointmentAction,
    phone: string
  ): Promise<void> {
    if (!ownerBotSupports(context.segment, kind)) {
      await this.reply(phone, "Essa ação não está disponível para este tipo de estabelecimento.");
      return;
    }

    const today = todayInSaoPaulo(this.now());
    const appointments = await this.actions.listAppointments(context.barbershopId, today);
    const candidates = appointments.filter((item) => this.isSelectable(item.status, kind));

    if (!candidates.length) {
      await this.reply(phone, "Não há horários elegíveis hoje para essa ação.");
      return;
    }

    state.flow = { kind, step: "APPOINTMENT" };
    state.lastList = {
      kind: "APPOINTMENTS",
      items: candidates.map((item) => ({
        id: item.id,
        label: `${item.time} — ${item.customerName} (${item.serviceName ?? "serviço"})`,
      })),
    };
    await this.saveState(phone, state);

    const actionLabel = {
      CANCEL: "cancelar",
      RESCHEDULE: "remarcar",
      CHECK_IN: "fazer check-in",
      COMPLETE: "encerrar",
      NO_SHOW: "marcar falta",
    }[kind];
    await this.reply(
      phone,
      `${OWNER_BOT_MESSAGES.appointmentsHeader(actionLabel)}\n${candidates
        .map((item, index) =>
          OWNER_BOT_MESSAGES.appointmentItem(
            index + 1,
            item.time,
            item.customerName,
            item.serviceName ?? "serviço"
          )
        )
        .join("\n")}`
    );
  }

  private isSelectable(status: string, kind: AppointmentAction): boolean {
    if (kind === "COMPLETE") return status === "CHECKED_IN" || status === "CONFIRMED";
    return status === "CONFIRMED";
  }

  private async startUnlinkFlow(
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    phone: string
  ): Promise<void> {
    state.flow = { kind: "UNLINK", step: "CONFIRM" };
    state.lastList = undefined;
    await this.saveState(phone, state);
    await this.reply(
      phone,
      `Desvincular o número do ${context.barbershopName}?\n\nConfirma? Responda 1-Sim ou 2-Nao.`
    );
  }

  /** Continua um fluxo em andamento. true = a mensagem foi consumida pelo fluxo. */
  private async continueFlow(
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    intent: OwnerBotIntent,
    text: string,
    phone: string,
    preferences: OwnerBotPreferences
  ): Promise<boolean> {
    const flow = state.flow;
    if (!flow) return false;

    if (intent.type === "DENY" || intent.type === "CANCEL") {
      state.flow = undefined;
      state.lastList = undefined;
      await this.saveState(phone, state);
      await this.reply(phone, OWNER_BOT_MESSAGES.cancelledFlow());
      return true;
    }

    // ─── Fluxo de comando do registry ────────────────────────────────────────
    if (flow.kind === "COMMAND") {
      if (flow.step === "CONFIRM") {
        const isSensitive = flow.riskClass === "SENSITIVE";
        const confirmed = isSensitive
          ? /^confirmar$/i.test(text.trim())
          : intent.type === "CONFIRM" || (intent.type === "SELECT" && intent.index === 1);
        const denied =
          !confirmed &&
          (intent.type === "SELECT" && intent.index === 2 ? true : false);

        if (confirmed) {
          const command = getOwnerBotCommand(flow.commandId ?? "");
          if (!command) {
            state.flow = undefined;
            await this.saveState(phone, state);
            await this.reply(phone, OWNER_BOT_MESSAGES.unknown());
            return true;
          }
          await this.runCommand(
            command,
            context,
            state,
            flow.entities as OwnerBotEntities,
            phone,
            preferences,
            true
          );
          return true;
        }

        if (denied) {
          state.flow = undefined;
          state.lastList = undefined;
          await this.saveState(phone, state);
          await this.reply(phone, OWNER_BOT_MESSAGES.cancelledFlow());
          return true;
        }

        if (isSensitive) {
          await this.reply(
            phone,
            `Para executar, digite CONFIRMAR (em maiúsculas). Ou responda 2 para cancelar.`
          );
          return true;
        }

        await this.reply(
          phone,
          OWNER_BOT_MESSAGES.askConfirmation(flow.confirmationSummary ?? "Confirma esta ação?")
        );
        return true;
      }

      if (flow.step === "AMOUNT") {
        const amount = extractOwnerBotAmount(text);
        if (!amount || amount <= 0) {
          await this.reply(phone, "Qual o valor? (ex.: 80 ou R$ 1.200,50)");
          return true;
        }
        flow.entities = { ...(flow.entities ?? {}), amount };
        flow.step = "CONFIRM";
        await this.saveState(phone, state);
        const command = getOwnerBotCommand(flow.commandId ?? "");
        if (command) {
          await this.runCommand(
            command,
            context,
            state,
            flow.entities as OwnerBotEntities,
            phone,
            preferences
          );
          return true;
        }
        await this.reply(phone, OWNER_BOT_MESSAGES.unknown());
        return true;
      }

      if (flow.step === "TEXT") {
        flow.entities = { ...(flow.entities ?? {}), subject: text, raw: text };
        flow.step = "CONFIRM";
        await this.saveState(phone, state);
        const command = getOwnerBotCommand(flow.commandId ?? "");
        if (command) {
          await this.runCommand(
            command,
            context,
            state,
            flow.entities as OwnerBotEntities,
            phone,
            preferences
          );
          return true;
        }
        await this.reply(phone, OWNER_BOT_MESSAGES.unknown());
        return true;
      }
    }

    // ─── Fluxos legados ──────────────────────────────────────────────────────

    // Passo CONFIRM dos fluxos legados (agendar, cancelar, unlink, lembrete...).
    if (flow.step === "CONFIRM" && flow.kind !== "COMMAND") {
      if (intent.type === "CONFIRM" || (intent.type === "SELECT" && intent.index === 1)) {
        await this.executeConfirmedAction(context, state, phone);
        return true;
      }
      if (intent.type === "SELECT" && intent.index === 2) {
        state.flow = undefined;
        state.lastList = undefined;
        await this.saveState(phone, state);
        await this.reply(phone, OWNER_BOT_MESSAGES.cancelledFlow());
        return true;
      }
      await this.reply(
        phone,
        OWNER_BOT_MESSAGES.askConfirmation(flow.summary ?? "Confirma esta ação?")
      );
      return true;
    }

    if (intent.type === "SELECT" && flow.step === "APPOINTMENT") {
      const item = state.lastList?.items[intent.index - 1];
      if (!item) {
        await this.reply(phone, OWNER_BOT_MESSAGES.invalidSelection());
        return true;
      }
      flow.appointmentId = item.id;
      if (flow.kind === "RESCHEDULE") {
        flow.step = "DATE";
        await this.saveState(phone, state);
        await this.reply(phone, OWNER_BOT_MESSAGES.askDate());
        return true;
      }
      flow.step = "CONFIRM";
      flow.summary = item.label;
      await this.saveState(phone, state);
      await this.reply(phone, OWNER_BOT_MESSAGES.askConfirmation(item.label));
      return true;
    }

    if (intent.type === "SELECT" && flow.step === "SERVICE") {
      const item = state.lastList?.items[intent.index - 1];
      if (!item) {
        await this.reply(phone, OWNER_BOT_MESSAGES.invalidSelection());
        return true;
      }
      flow.serviceId = item.id;
      flow.serviceName = item.label;
      if (flow.kind === "WALK_IN") {
        flow.step = "CLIENT_NAME";
        await this.saveState(phone, state);
        await this.reply(phone, OWNER_BOT_MESSAGES.askClientName());
        return true;
      }
      flow.step = "DATE";
      await this.saveState(phone, state);
      await this.reply(phone, OWNER_BOT_MESSAGES.askDate());
      return true;
    }

    if (flow.step === "DATE") {
      const date = parseOwnerBotDate(text, todayInSaoPaulo(this.now()));
      if (!date) {
        await this.reply(phone, OWNER_BOT_MESSAGES.askDate());
        return true;
      }
      flow.date = date;
      flow.step = "TIME";
      await this.saveState(phone, state);
      await this.reply(phone, OWNER_BOT_MESSAGES.askTime());
      return true;
    }

    if (flow.step === "TIME") {
      const time = parseOwnerBotTime(text);
      if (!time) {
        await this.reply(phone, OWNER_BOT_MESSAGES.askTime());
        return true;
      }
      flow.time = time;
      flow.step = flow.kind === "RESCHEDULE" ? "CONFIRM" : "CLIENT_NAME";
      await this.saveState(phone, state);
      if (flow.kind === "RESCHEDULE") {
        const summary = `${flow.summary ?? "horário"} → ${formatDateLabel(flow.date ?? "")} às ${flow.time ?? ""}`;
        flow.summary = summary;
        await this.reply(phone, OWNER_BOT_MESSAGES.askConfirmation(summary));
        return true;
      }
      await this.reply(phone, OWNER_BOT_MESSAGES.askClientName());
      return true;
    }

    if (flow.step === "CLIENT_NAME") {
      const name = text.trim();
      if (!name) {
        await this.reply(phone, OWNER_BOT_MESSAGES.askClientName());
        return true;
      }
      flow.clientName = name;
      flow.step = "CLIENT_PHONE";
      await this.saveState(phone, state);
      await this.reply(phone, OWNER_BOT_MESSAGES.askClientPhone());
      return true;
    }

    if (flow.step === "CLIENT_PHONE") {
      const clientPhone = normalizeWhatsAppPhone(text);
      if (clientPhone.length < 12) {
        await this.reply(phone, OWNER_BOT_MESSAGES.askClientPhone());
        return true;
      }
      flow.clientPhone = clientPhone;
      flow.step = "CONFIRM";
      flow.summary = this.scheduleSummary(context, flow);
      await this.saveState(phone, state);
      await this.reply(phone, OWNER_BOT_MESSAGES.askConfirmation(flow.summary));
      return true;
    }

    // ─── Fluxos com lista própria (waitlist / lembrete / mensagem) ──────────

    if (flow.kind === "WAITLIST_REMOVE" && flow.step === "WAITLIST_CONFIRM") {
      if (intent.type === "SELECT") {
        const item = state.lastList?.items[intent.index - 1];
        if (!item) {
          await this.reply(phone, OWNER_BOT_MESSAGES.invalidSelection());
          return true;
        }
        flow.appointmentId = item.id;
        flow.summary = item.label;
        await this.saveState(phone, state);
        await this.reply(phone, OWNER_BOT_MESSAGES.askConfirmation(item.label));
        return true;
      }
      if (intent.type === "CONFIRM") {
        await this.executeConfirmedAction(context, state, phone);
        return true;
      }
      await this.reply(phone, OWNER_BOT_MESSAGES.askConfirmation(flow.summary ?? "Confirma?"));
      return true;
    }

    if (flow.kind === "WAITLIST_OFFER") {
      if (flow.step === "WAITLIST_DATE") {
        const date = parseOwnerBotDate(text, todayInSaoPaulo(this.now()));
        if (!date) {
          await this.reply(phone, OWNER_BOT_MESSAGES.askDate());
          return true;
        }
        flow.date = date;
        flow.step = "WAITLIST_TIME";
        await this.saveState(phone, state);
        await this.reply(phone, OWNER_BOT_MESSAGES.askTime());
        return true;
      }
      if (flow.step === "WAITLIST_TIME") {
        const time = parseOwnerBotTime(text);
        if (!time) {
          await this.reply(phone, OWNER_BOT_MESSAGES.askTime());
          return true;
        }
        flow.time = time;
        flow.step = "WAITLIST_CONFIRM";
        flow.summary = `Oferecer vaga ${formatDateLabel(flow.date ?? "")} às ${time}`;
        await this.saveState(phone, state);
        await this.reply(phone, OWNER_BOT_MESSAGES.askConfirmation(flow.summary));
        return true;
      }
      if (flow.step === "WAITLIST_CONFIRM") {
        if (intent.type === "CONFIRM" || (intent.type === "SELECT" && intent.index === 1)) {
          await this.executeConfirmedAction(context, state, phone);
          return true;
        }
        await this.reply(phone, OWNER_BOT_MESSAGES.askConfirmation(flow.summary ?? "Confirma?"));
        return true;
      }
    }

    if (flow.kind === "REMINDER" && flow.step === "REMINDER_CONFIRM") {
      if (intent.type === "SELECT") {
        const item = state.lastList?.items[intent.index - 1];
        if (!item) {
          await this.reply(phone, OWNER_BOT_MESSAGES.invalidSelection());
          return true;
        }
        flow.appointmentId = item.id;
        flow.summary = item.label;
        await this.saveState(phone, state);
        await this.reply(phone, OWNER_BOT_MESSAGES.askConfirmation(item.label));
        return true;
      }
      if (intent.type === "CONFIRM") {
        await this.executeConfirmedAction(context, state, phone);
        return true;
      }
      await this.reply(phone, OWNER_BOT_MESSAGES.askConfirmation(flow.summary ?? "Confirma?"));
      return true;
    }

    if (flow.kind === "CLIENT_MESSAGE" && flow.step === "CLIENT_MESSAGE_TEXT") {
      flow.summary = text.trim();
      if (!flow.summary) {
        await this.reply(phone, "Qual mensagem devo enviar?");
        return true;
      }
      flow.step = "CONFIRM";
      await this.saveState(phone, state);
      await this.reply(
        phone,
        OWNER_BOT_MESSAGES.askConfirmation(
          `Mensagem para ${flow.clientName ?? "cliente"}: "${flow.summary.slice(0, 120)}"`
        )
      );
      return true;
    }

    return false;
  }

  private scheduleSummary(context: OwnerBotLinkContext, flow: OwnerBotFlow): string {
    const labels = getOwnerBotLabels(context.segment);
    const serviceName = flow.serviceName ?? labels.service;
    return [
      `${flow.clientName ?? "cliente"}`,
      serviceName,
      `${formatDateLabel(flow.date ?? "")} às ${flow.time ?? ""}`,
    ].join(" — ");
  }

  // ─── Execução ──────────────────────────────────────────────────────────────

  private async executeConfirmedAction(
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    phone: string
  ): Promise<void> {
    const flow = state.flow;
    if (!flow) return;

    const actor: OwnerBotActor = {
      userId: context.userId,
      role: "OWNER",
      barbershopId: context.barbershopId,
    };

    try {
      switch (flow.kind) {
        case "SCHEDULE": {
          const created = await this.actions.createAppointment(
            {
              barbershopId: context.barbershopId,
              serviceId: flow.serviceId ?? "",
              customerName: flow.clientName ?? "",
              whatsapp: flow.clientPhone ?? "",
              date: flow.date ?? "",
              time: flow.time ?? "",
            },
            actor
          );
          await this.log(context, phone, "SCHEDULE", "WRITE", flow, "SUCCESS");
          await this.clearFlow(state, phone);
          await this.reply(
            phone,
            OWNER_BOT_MESSAGES.scheduleSuccess(
              created.customerName,
              formatRelativeDateLabel(flow.date ?? "", todayInSaoPaulo(this.now())),
              created.time,
              created.serviceName ?? "serviço"
            )
          );
          return;
        }

        case "WALK_IN": {
          await this.actions.joinQueue(
            {
              barbershopId: context.barbershopId,
              serviceId: flow.serviceId ?? "",
              customerName: flow.clientName ?? "",
              whatsapp: flow.clientPhone ?? "",
            },
            actor
          );
          await this.log(context, phone, "WALK_IN", "WRITE", flow, "SUCCESS");
          await this.clearFlow(state, phone);
          await this.reply(phone, OWNER_BOT_MESSAGES.walkInSuccess(flow.summary ?? ""));
          return;
        }

        case "CANCEL": {
          await this.actions.cancelAppointment(flow.appointmentId ?? "", actor);
          await this.log(context, phone, "CANCEL", "WRITE", flow, "SUCCESS");
          await this.clearFlow(state, phone);
          await this.reply(phone, OWNER_BOT_MESSAGES.cancelSuccess(flow.summary ?? ""));
          return;
        }

        case "RESCHEDULE": {
          await this.actions.rescheduleAppointment(
            flow.appointmentId ?? "",
            { date: flow.date ?? "", time: flow.time ?? "" },
            actor
          );
          await this.log(context, phone, "RESCHEDULE", "WRITE", flow, "SUCCESS");
          await this.clearFlow(state, phone);
          await this.reply(phone, OWNER_BOT_MESSAGES.rescheduleSuccess(flow.summary ?? ""));
          return;
        }

        case "CHECK_IN": {
          await this.actions.checkIn(flow.appointmentId ?? "", actor);
          await this.log(context, phone, "CHECK_IN", "WRITE", flow, "SUCCESS");
          await this.clearFlow(state, phone);
          await this.reply(phone, OWNER_BOT_MESSAGES.checkInSuccess(flow.summary ?? ""));
          return;
        }

        case "COMPLETE": {
          await this.actions.completeAppointment(flow.appointmentId ?? "", actor);
          await this.log(context, phone, "COMPLETE", "WRITE", flow, "SUCCESS");
          await this.clearFlow(state, phone);
          const next = await this.nextClientLabel(context);
          await this.reply(
            phone,
            `${OWNER_BOT_MESSAGES.completeSuccess(flow.summary ?? "")}\n\n${OWNER_BOT_MESSAGES.nextClient(
              next
            )}`
          );
          return;
        }

        case "NO_SHOW": {
          await this.actions.markNoShow(flow.appointmentId ?? "", actor);
          await this.log(context, phone, "NO_SHOW", "WRITE", flow, "SUCCESS");
          await this.clearFlow(state, phone);
          await this.reply(phone, OWNER_BOT_MESSAGES.noShowSuccess(flow.summary ?? ""));
          return;
        }

        case "WAITLIST_REMOVE": {
          await this.actions.removeWaitlistEntry(
            context.barbershopId,
            flow.appointmentId ?? ""
          );
          await this.log(context, phone, "WAITLIST_REMOVE", "WRITE", flow, "SUCCESS");
          await this.clearFlow(state, phone);
          await this.reply(phone, "Removido da lista de espera.");
          return;
        }

        case "WAITLIST_OFFER": {
          await this.actions.offerWaitlistSlot(context.barbershopId, flow.appointmentId ?? "", {
            date: flow.date ?? "",
            time: flow.time ?? "",
            staffId: "",
          });
          await this.log(context, phone, "WAITLIST_OFFER", "WRITE", flow, "SUCCESS");
          await this.clearFlow(state, phone);
          await this.reply(phone, `Vaga oferecida: ${flow.summary ?? ""}`);
          return;
        }

        case "REMINDER": {
          const appointments = await this.actions.listAppointments(
            context.barbershopId,
            todayInSaoPaulo(this.now())
          );
          const appointment = appointments.find((item) => item.id === flow.appointmentId);
          if (appointment?.whatsapp) {
            await this.actions.sendToShopClient(
              context.barbershopId,
              appointment.whatsapp,
              `Olá ${appointment.customerName}! Lembrete do seu horário às ${appointment.time} (${appointment.serviceName ?? "serviço"}).`,
              { clientId: null, type: "APPOINTMENT_REMINDER" }
            );
          }
          await this.log(context, phone, "REMINDER", "WRITE", flow, "SUCCESS");
          await this.clearFlow(state, phone);
          await this.reply(phone, `Lembrete enviado para ${flow.summary ?? "o cliente"}.`);
          return;
        }

        case "CLIENT_MESSAGE": {
          const clients = await this.actions.listClients(context.barbershopId, { limit: 50 });
          const client = clients.find((item) => item.id === flow.clientId);
          if (client?.whatsapp) {
            const sent = await this.actions.sendToShopClient(
              context.barbershopId,
              client.whatsapp,
              flow.summary ?? "",
              { clientId: client.id, type: "OWNER_BOT_MESSAGE" }
            );
            if (!sent.ok) throw new AppError(sent.error ?? "WhatsApp indisponível");
          }
          await this.log(context, phone, "CLIENT_MESSAGE", "WRITE", flow, "SUCCESS");
          await this.clearFlow(state, phone);
          await this.reply(phone, `Mensagem enviada para ${flow.clientName ?? "o cliente"}.`);
          return;
        }

        case "UNLINK": {
          await this.repo.revokeLink(context.linkId);
          await this.log(context, phone, "UNLINK", "WRITE", flow, "SUCCESS");
          state.activeShopId = undefined;
          await this.clearFlow(state, phone);
          await this.reply(phone, OWNER_BOT_MESSAGES.unlinked());
          return;
        }
      }
    } catch (error: unknown) {
      const message = error instanceof AppError ? error.message : "não consegui concluir agora";
      await this.log(context, phone, flow.kind, "WRITE", flow, "ERROR", message);
      await this.clearFlow(state, phone);
      await this.reply(phone, `Não consegui concluir: ${message}.`);
    }
  }

  private async nextClientLabel(context: OwnerBotLinkContext): Promise<string | null> {
    const waiting = await this.actions.listWaitingQueue(context.barbershopId);
    const next = waiting[0];
    if (next) return `${next.customerName} (${next.serviceName ?? "serviço"})`;

    const today = todayInSaoPaulo(this.now());
    const appointments = await this.actions.listAppointments(context.barbershopId, today);
    const nowTime = this.now().toISOString().slice(11, 16);
    const upcoming = appointments.find(
      (item) => item.status === "CONFIRMED" && item.time > nowTime
    );
    return upcoming ? `${upcoming.time} — ${upcoming.customerName}` : null;
  }

  // ─── Desfazer ──────────────────────────────────────────────────────────────

  private async handleUndo(
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    phone: string
  ): Promise<void> {
    const undo = state.undo;
    const fresh =
      undo && this.now().getTime() - undo.at <= UNDO_TTL_MS ? undo : undefined;
    if (!fresh) {
      await this.reply(
        phone,
        "Não tenho nenhuma ação recente para desfazer (a janela é de 2 minutos)."
      );
      return;
    }

    const undoFn = UNDOABLE_COMMANDS[fresh.commandId];
    if (!undoFn) {
      state.undo = undefined;
      await this.saveState(phone, phone ? state : state);
      await this.reply(phone, "Essa ação não pode ser desfeita com segurança.");
      return;
    }

    const ctx = this.buildCommandContext(
      context,
      state,
      { raw: "desfazer" },
      OWNER_BOT_DEFAULT_PREFS,
      true
    );
    try {
      const message = await undoFn(ctx, fresh.affectedIds);
      if (fresh.logId) await this.repo.markActionUndone(fresh.logId).catch(() => undefined);
      state.undo = undefined;
      await this.saveState(phone, state);
      await this.log(context, phone, `UNDO:${fresh.commandId}`, "WRITE", {}, "SUCCESS");
      await this.reply(phone, `${message} Quer ver o resultado atual?`);
    } catch (error: unknown) {
      const msg = error instanceof AppError ? error.message : "não consegui desfazer";
      await this.reply(phone, `Não consegui desfazer: ${msg}.`);
    }
  }

  // ─── Contexto de comando ──────────────────────────────────────────────────

  private buildEntities(raw: string, _context: OwnerBotLinkContext, _state: OwnerBotConversationState): OwnerBotEntities {
    const timezone = "America/Sao_Paulo";
    const now = this.now();
    const period =
      resolveOwnerBotPeriod(normalizeText(raw), timezone, now) ??
      resolveOwnerBotPeriod(normalizeText(raw), timezone, now, "day");
    const entities: OwnerBotEntities = {
      raw: normalizeText(raw),
      period: period as OwnerBotPeriod,
    };
    const amount = extractOwnerBotAmount(raw);
    if (amount) entities.amount = amount;
    const clientName = extractOwnerBotPersonName(raw);
    if (clientName) entities.clientName = clientName;
    const serviceName = extractOwnerBotServiceName(raw);
    if (serviceName) entities.serviceName = serviceName;
    const subject = extractOwnerBotSubject(raw);
    if (subject) entities.subject = subject;
    const time = raw.match(/\b(\d{1,2}:\d{2})\b/)?.[1];
    if (time) entities.time = time;
    return entities;
  }

  private recallMemory(
    state: OwnerBotConversationState,
    entities: OwnerBotEntities
  ): { commandId: string; entities: OwnerBotEntities } | null {
    const memory = state.memory;
    if (!memory) return null;
    if (this.now().getTime() - memory.at > MEMORY_TTL_MS) return null;

    const merged: OwnerBotEntities = { ...(memory.entities as OwnerBotEntities), ...entities };
    // Follow-up curto ("e amanhã?", "e da maria?") herda o que faltou.
    const isFollowUp =
      /^(e|e ai|e ai|e dai|e dai|e depois|e o que mais)\b/.test(entities.raw) ||
      /^(amanha|ontem|hoje|semana passada|mes passado)\b/.test(entities.raw);
    if (!isFollowUp && !entities.clientName && !entities.period && !entities.amount) {
      return null;
    }
    return { commandId: memory.commandId, entities: merged };
  }

  private buildCommandContext(
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    entities: OwnerBotEntities,
    preferences: OwnerBotPreferences,
    confirmed: boolean
  ): OwnerBotCommandContext {
    const timezone = "America/Sao_Paulo";
    const now = this.now();
    const profile = getOwnerBotSegmentProfile(context.segment);
    const labels = getOwnerBotLabels(context.segment);

    return {
      link: context,
      actor: {
        userId: context.userId,
        role: "OWNER",
        barbershopId: context.barbershopId,
      },
      segment: context.segment,
      labels: {
        client: labels.client ?? "cliente",
        clientPlural: labels.clientPlural ?? "clientes",
        service: labels.service ?? "serviço",
        servicePlural: labels.servicePlural ?? "serviços",
        professional: labels.professional ?? "profissional",
        professionalPlural: labels.professionalPlural ?? "profissionais",
        queue: labels.queue ?? "fila",
        staff: labels.staff ?? "equipe",
        appointment: labels.appointment ?? "horário",
        shopNoun: profile.vocabulary.todayNoun,
        ticketUnit: profile.vocabulary.ticketUnit,
      },
      linkedShops: [],
      raw: entities.raw,
      commands: OWNER_BOT_COMMANDS,
      actions: this.actions,
      preferences,
      state,
      now,
      timezone,
      periods: {
        day: resolveOwnerBotPeriod("", timezone, now, "day")!,
        week: resolveOwnerBotPeriod("", timezone, now, "week")!,
        month: resolveOwnerBotPeriod("", timezone, now, "month")!,
      },
      confirmed,
    };
  }

  private async listShops(
    context: OwnerBotLinkContext,
    state: OwnerBotConversationState,
    phone: string
  ): Promise<void> {
    const links = await this.repo.findActiveLinksByUser(context.userId);
    if (links.length <= 1) {
      await this.reply(phone, OWNER_BOT_MESSAGES.activeShop(context.barbershopName));
      return;
    }
    state.lastList = {
      kind: "SHOPS",
      items: links.map((link) => ({ id: link.barbershopId, label: link.barbershop.name })),
    };
    await this.saveState(phone, state);
    await this.reply(
      phone,
      `Qual unidade?\n${links
        .map((link, index) => `${index + 1}. ${link.barbershop.name}`)
        .join("\n")}`
    );
  }

  // ─── Auditoria ─────────────────────────────────────────────────────────────

  private async logCommand(
    context: OwnerBotLinkContext,
    phone: string,
    command: OwnerBotCommand,
    entities: OwnerBotEntities,
    outcome: { affectedIds?: string[] },
    canUndo: boolean
  ): Promise<string | undefined> {
    try {
      return await this.repo.logAction({
        barbershopId: context.barbershopId,
        userId: context.userId,
        phoneMasked: maskPhone(phone),
        action: command.id,
        status: "SUCCESS",
        request: { raw: entities.raw.slice(0, 200) },
        commandId: command.id,
        riskClass: command.risk,
        affectedIds: outcome.affectedIds ?? [],
        canUndo,
      });
    } catch (err) {
      logger.warn({ err }, "Falha ao registrar ação do assistente");
      return undefined;
    }
  }

  private async log(
    context: OwnerBotLinkContext,
    phone: string,
    action: string,
    riskClass: string,
    request: unknown,
    status: "SUCCESS" | "ERROR" = "SUCCESS",
    errorMessage?: string
  ): Promise<void> {
    await this.repo
      .logAction({
        barbershopId: context.barbershopId,
        userId: context.userId,
        phoneMasked: maskPhone(phone),
        action,
        status,
        request,
        errorMessage: errorMessage ?? null,
        riskClass,
      })
      .catch((err: unknown) => logger.warn({ err }, "Falha ao registrar ação do assistente"));
  }

  // ─── Utilidades ────────────────────────────────────────────────────────────

  private async reply(phone: string, text: string): Promise<void> {
    const parts = splitMessage(text);
    for (const part of parts) {
      try {
        const sent = await this.messenger.send(phone, part);
        if (!sent) {
          logger.warn({ phone: maskPhone(phone) }, "Resposta do assistente não enviada");
        }
      } catch (err) {
        logger.warn({ err }, "Erro ao enviar resposta do assistente");
      }
    }
  }

  private async clearFlow(state: OwnerBotConversationState, phone: string): Promise<void> {
    state.flow = undefined;
    state.lastList = undefined;
    await this.saveState(phone, state);
  }

  private async saveState(phone: string, state: OwnerBotConversationState): Promise<void> {
    state.updatedAt = this.now().getTime();
    await this.store.setState(phone, state);
  }
}

const OWNER_BOT_DEFAULT_PREFS = {
  enabled: true,
  blocked: false,
  briefingEnabled: false,
  briefingTime: "07:30",
  summaryEnabled: false,
  summaryTime: "21:00",
  alertsEnabled: true,
  alertTypes: [],
  tone: "FRIENDLY",
  language: "pt-BR",
} as OwnerBotPreferences;

/** Divide a resposta em partes de no máximo 1500 caracteres (limite do WhatsApp). */
export function splitMessage(text: string, max = 1500): string[] {
  const truncated = truncateMessage(text, max);
  if (truncated.length <= max) return [truncated];
  const parts: string[] = [];
  let remaining = truncated;
  while (remaining.length > max) {
    const cut = remaining.lastIndexOf("\n", max);
    const index = cut > 0 ? cut : max;
    parts.push(remaining.slice(0, index).trimEnd());
    remaining = remaining.slice(index).trimStart();
  }
  if (remaining) parts.push(remaining);
  return parts;
}
