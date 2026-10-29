import type { BusinessSegment } from "@prisma/client";

/**
 * Tipos do assistente de WhatsApp do dono.
 *
 * O assistente conversa com o DONO do estabelecimento (não com o cliente
 * final). Ele executa as mesmas ações do app, sempre через os use cases
 * existentes — o bot nunca escreve direto no banco.
 */

export type OwnerBotIntentType =
  | "HELP"
  | "GREETING"
  | "LINK_CODE"
  | "UNLINK"
  | "SCHEDULE"
  | "AGENDA"
  | "CANCEL"
  | "RESCHEDULE"
  | "CHECK_IN"
  | "COMPLETE"
  | "NO_SHOW"
  | "WALK_IN"
  | "SWITCH_SHOP"
  | "CONFIRM"
  | "DENY"
  | "SELECT"
  | "UNKNOWN";

export type OwnerBotIntent =
  | { type: "HELP" }
  | { type: "GREETING" }
  | { type: "LINK_CODE"; code: string }
  | { type: "UNLINK" }
  | { type: "SCHEDULE" }
  | { type: "AGENDA" }
  | { type: "CANCEL" }
  | { type: "RESCHEDULE" }
  | { type: "CHECK_IN" }
  | { type: "COMPLETE" }
  | { type: "NO_SHOW" }
  | { type: "WALK_IN" }
  | { type: "SWITCH_SHOP" }
  | { type: "CONFIRM" }
  | { type: "DENY" }
  | { type: "SELECT"; index: number }
  | { type: "UNKNOWN" };

export type OwnerBotCapability =
  | "SCHEDULE"
  | "AGENDA"
  | "CANCEL"
  | "RESCHEDULE"
  | "CHECK_IN"
  | "COMPLETE"
  | "NO_SHOW"
  | "WALK_IN";

export type OwnerBotSegmentProfile = {
  /** Ações que o assistente oferece neste segmento. */
  capabilities: OwnerBotCapability[];
  /** Linhas do card "O que posso fazer por aqui" (front + mensagem de ajuda). */
  highlights: string[];
  /** Ficha auxiliar pedida ao agendar (pet ou veículo). */
  auxiliaryProfile?: "pet" | "vehicle";
  /** Aviso obrigatório nos segmentos de saúde (não é prontuário). */
  complianceNote?: string;
};

export type OwnerBotFlowKind =
  | "SCHEDULE"
  | "CANCEL"
  | "RESCHEDULE"
  | "CHECK_IN"
  | "COMPLETE"
  | "NO_SHOW"
  | "WALK_IN"
  | "UNLINK"
  | "WAITLIST_OFFER"
  | "WAITLIST_REMOVE"
  | "CLIENT_MESSAGE"
  | "REMINDER"
  | "COMMAND";

export type OwnerBotFlowStep =
  | "APPOINTMENT"
  | "SERVICE"
  | "DATE"
  | "TIME"
  | "CLIENT_NAME"
  | "CLIENT_PHONE"
  | "CONFIRM"
  | "AMOUNT"
  | "PAYMENT"
  | "TEXT"
  | "WAITLIST_DATE"
  | "WAITLIST_TIME"
  | "WAITLIST_CONFIRM"
  | "CLIENT_MESSAGE_TEXT"
  | "REMINDER_CONFIRM";

export type OwnerBotFlow = {
  kind: OwnerBotFlowKind;
  step: OwnerBotFlowStep;
  /** Comando do registry que originou o fluxo (para reexecutar após confirmar). */
  commandId?: string;
  /** Entidades extraídas do pedido (reaproveitadas na confirmação). */
  entities?: Record<string, unknown>;
  /** Classe de risco do comando pendente de confirmação. */
  riskClass?: "READ" | "WRITE" | "SENSITIVE";
  /** Resumo exibido na confirmação. */
  confirmationSummary?: string;
  serviceId?: string;
  /** Nome do serviço escolhido (usado no resumo da confirmação). */
  serviceName?: string;
  appointmentId?: string;
  date?: string;
  time?: string;
  clientName?: string;
  clientPhone?: string;
  /** Cliente alvo de mensagem/lembrete (fluxo CLIENT_MESSAGE). */
  clientId?: string;
  auxiliaryValue?: string;
  /** Texto do resumo exibido na confirmação. */
  summary?: string;
};

export type OwnerBotListKind =
  | "SERVICES"
  | "APPOINTMENTS"
  | "SHOPS"
  | "STAFF"
  | "QUEUE"
  | "WAITLIST"
  | "CLIENTS"
  | "COMMANDS"
  | "EXPENSES"
  | "FIADOS"
  | "PRODUCTS"
  | "DEADLINES"
  | "TASKS"
  | "INTIMATIONS";

export type OwnerBotListItem = {
  id: string;
  label: string;
};

export type OwnerBotConversationState = {
  /** Unidade ativa no contexto (multi-unidade). */
  activeShopId?: string;
  /** Fluxo em andamento (multi-step). */
  flow?: OwnerBotFlow;
  /** Última lista exibida — resolve a escolha por número. */
  lastList?: { kind: OwnerBotListKind; items: OwnerBotListItem[] };
  /** Última ação de escrita desfezível (janela de 2 minutos). */
  undo?: { logId?: string; commandId: string; affectedIds: string[]; at: number };
  /** Memória curta de contexto (30 min): último comando e entidades. */
  memory?: { commandId: string; entities: Record<string, unknown>; at: number };
  updatedAt: number;
};

export type OwnerBotIncomingMessage = {
  /** Id da mensagem na Evolution (chave de idempotência). */
  messageId: string;
  phone: string;
  text: string;
  /** Instância que recebeu a mensagem (instância da plataforma). */
  instanceName?: string;
};

export type OwnerBotLinkContext = {
  linkId: string;
  userId: string;
  barbershopId: string;
  barbershopName: string;
  normalizedPhone: string;
  segment: BusinessSegment;
  ownerName: string;
};
