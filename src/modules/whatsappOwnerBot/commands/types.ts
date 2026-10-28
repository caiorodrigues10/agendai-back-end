import type { BusinessSegment } from "@prisma/client";
import type { OwnerBotActions, OwnerBotActor } from "../ownerBotActions";
import type {
  OwnerBotConversationState,
  OwnerBotFlow,
  OwnerBotLinkContext,
  OwnerBotListItem,
  OwnerBotListKind,
} from "../types";
import type { OwnerBotPreferences } from "../ownerBotPreferences";

/**
 * Tipos do registry de comandos do assistente.
 *
 * Cada comando é uma entrada tipada: categoria, classe de risco, segmentos
 * em que aparece, gatilhos de linguagem natural e um handler fino que chama
 * os use cases do app. Nenhum comando escreve direto no banco.
 */

/** Classe de risco — define como o assistente pede confirmação. */
export type OwnerBotRiskClass = "READ" | "WRITE" | "SENSITIVE";

export type OwnerBotCommandCategory =
  | "AGENDA"
  | "CLIENTES"
  | "FINANCEIRO"
  | "EQUIPE"
  | "ESTOQUE"
  | "SERVICOS"
  | "MARKETING"
  | "OPERACAO"
  | "CONTA";

export type OwnerBotPeriodKind = "day" | "week" | "month" | "range";

export type OwnerBotPeriod = {
  kind: OwnerBotPeriodKind;
  /** Rótulo para a resposta ("hoje", "semana passada", "outubro/2026"). */
  label: string;
  from: Date;
  to: Date;
  /** Chave YYYY-MM quando o período é mensal. */
  monthKey?: string;
};

/** Entidades extraídas da mensagem do dono. */
export type OwnerBotEntities = {
  amount?: number;
  /** Telefone citado pelo dono (já normalizado quando possível). */
  phone?: string;
  period?: OwnerBotPeriod;
  date?: string;
  time?: string;
  clientName?: string;
  clientId?: string;
  serviceId?: string;
  serviceName?: string;
  staffId?: string;
  staffName?: string;
  /** Texto livre do pedido (ex.: "produto", "clientes sumidos"). */
  subject?: string;
  /** Mensagem original normalizada. */
  raw: string;
};

export type OwnerBotCommandContext = {
  link: OwnerBotLinkContext;
  actor: OwnerBotActor;
  segment: BusinessSegment;
  labels: {
    client: string;
    clientPlural: string;
    service: string;
    servicePlural: string;
    professional: string;
    professionalPlural: string;
    queue: string;
    staff: string;
    appointment: string;
    shopNoun: string;
    /** Unidade do ticket do segmento ("atendimento", "sessão", "aula"...). */
    ticketUnit: string;
  };
  /** Unidades (estabelecimentos) vinculadas ao dono. */
  linkedShops: Array<{ id: string; name: string }>;
  /** Mensagem original (normalizada) do dono. */
  raw: string;
  /** Registry de comandos (usado pelo menu e pela ajuda). */
  commands: OwnerBotCommand[];
  actions: OwnerBotActions;
  preferences: OwnerBotPreferences;
  state: OwnerBotConversationState;
  now: Date;
  timezone: string;
  /** Períodos prontos (dia, semana e mês) no fuso do salão. */
  periods: {
    day: OwnerBotPeriod;
    week: OwnerBotPeriod;
    month: OwnerBotPeriod;
  };
  /** true quando o dono já confirmou a ação (2ª execução do comando). */
  confirmed: boolean;
};

export type OwnerBotCommandOutcome = {
  text: string;
  /** Lista exibida (para escolha por número). */
  list?: { kind: OwnerBotListKind; items: OwnerBotListItem[] };
  /** Sugestões curtas para o próximo passo. */
  suggestions?: string[];
  /** Resumo de confirmação — presente em comandos de escrita não confirmados. */
  confirmation?: { summary: string; strong?: boolean };
  /** Fluxo multi-passo a iniciar. */
  flow?: OwnerBotFlow;
  /** Ids afetados pela ação (auditoria). */
  affectedIds?: string[];
};

export type OwnerBotCommand = {
  id: string;
  category: OwnerBotCommandCategory;
  risk: OwnerBotRiskClass;
  /** Segmentos onde o comando aparece; ausente = todos. */
  segments?: BusinessSegment[];
  /** Gatilhos em PT-BR (texto já normalizado, sem acentos). */
  triggers: RegExp[];
  /** Palavras-chave para o fallback fuzzy (sem acentos). */
  keywords?: string[];
  /** Descrição curta (menu "ajuda"). */
  description: string;
  /** Exemplos reais de frases (menu "ajuda" por segmento). */
  examples: string[];
  /** Handler fino — chama use cases do app. */
  run: (
    ctx: OwnerBotCommandContext,
    entities: OwnerBotEntities
  ) => Promise<OwnerBotCommandOutcome>;
};
