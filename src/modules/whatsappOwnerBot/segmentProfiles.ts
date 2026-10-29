import type { BusinessSegment } from "@prisma/client";
import { SEGMENT_CONFIGS } from "@/shared/segments";
import type { OwnerBotCapability } from "./types";
import type { OwnerBotCommandCategory } from "./commands/types";

/**
 * Perfil do assistente por segmento.
 *
 * A lista é exaustiva de propósito: se um `BusinessSegment` novo entrar no
 * Prisma sem perfil aqui, o TypeScript quebra na compilação — nunca
 * silenciosamente um segmento sem comportamento definido.
 *
 * Cada perfil define:
 * - `capabilities`: o que o assistente faz hoje (agenda/fila);
 * - `categories`: categorias do menu liberadas no segmento;
 * - `vocabulary`: como o segmento chama cliente, atendimento e o trabalho do dia;
 * - `highlights`: linhas do card "O que posso fazer por aqui".
 */

export type OwnerBotSegmentVocabulary = {
  /** Como o dono chama o trabalho do dia ("consultas de hoje", "ordens do dia"). */
  todayNoun: string;
  /** Unidade do ticket ("atendimento", "sessão", "aula", "ordem de serviço"). */
  ticketUnit: string;
  /** Como chamar quem é atendido ("tutores de hoje", "alunos da semana"). */
  clientsOfDay: string;
  /** Como chamar a ficha auxiliar (pet/veículo), quando existir. */
  auxiliaryNoun?: string;
  /**
   * Nome da audiência formal, quando o segmento tem ("audiência"). O
   * briefing do dia conta essas audiências pelo nome do atendimento.
   */
  hearingNoun?: string;
  /** Palavras que marcam audiência no nome do atendimento. */
  hearingKeywords?: string[];
};

export type OwnerBotSegmentProfile = {
  /** Ações que o assistente oferece neste segmento. */
  capabilities: OwnerBotCapability[];
  /** Categorias do menu disponíveis neste segmento. */
  categories: OwnerBotCommandCategory[];
  /** Linhas do card "O que posso fazer por aqui" (front + mensagem de ajuda). */
  highlights: string[];
  /** Ficha auxiliar pedida ao agendar (pet ou veículo). */
  auxiliaryProfile?: "pet" | "vehicle";
  /** Aviso obrigatório nos segmentos de saúde (não é prontuário). */
  complianceNote?: string;
  /**
   * Exemplos por comando, no tom do segmento. A "ajuda" mostra estes
   * exemplos em vez dos genéricos ("marcar corte amanhã às 10h" vira
   * "marcar audiência amanhã às 10h" no escritório).
   */
  examples?: Record<string, string[]>;
  /**
   * Comandos que não existem neste segmento (fila e lista de espera em
   * escritório, comissões onde o repository é honorário, cupom promocional).
   */
  hiddenCommands?: string[];
  /**
   * Descrições por comando, no tom do segmento ("Próximo cliente da fila"
   * vira "Próximo cliente na agenda" no escritório).
   */
  descriptions?: Record<string, string>;
  /** Vocabulário próprio do segmento. */
  vocabulary: OwnerBotSegmentVocabulary;
};

const FULL_CAPABILITIES: OwnerBotCapability[] = [
  "SCHEDULE",
  "AGENDA",
  "CANCEL",
  "RESCHEDULE",
  "CHECK_IN",
  "COMPLETE",
  "NO_SHOW",
  "WALK_IN",
];

/** Agenda pura: sem check-in de fila e sem encaixe. */
const HEALTH_CAPABILITIES: OwnerBotCapability[] = [
  "SCHEDULE",
  "AGENDA",
  "CANCEL",
  "RESCHEDULE",
  "NO_SHOW",
];

/**
 * Escritório: agenda pura, mas com check-in e encerramento do atendimento
 * ("o cliente chegou", "encerrar atendimento"). Sem fila e sem walk-in.
 */
const OFFICE_CAPABILITIES: OwnerBotCapability[] = [
  "SCHEDULE",
  "AGENDA",
  "CANCEL",
  "RESCHEDULE",
  "CHECK_IN",
  "COMPLETE",
  "NO_SHOW",
];

const COMPLIANCE_NOTE =
  "O assistente organiza agenda e relacionamento com clientes. Não é prontuário clínico e não substitui documentação profissional regulada.";

const BASE_HIGHLIGHTS: string[] = [
  "Ver a agenda do dia",
  "Agendar um novo horário",
  "Cancelar ou remarcar um horário",
  "Marcar falta (não compareceu)",
  "Encaixar um cliente que chegou na hora",
];

const BASE_CATEGORIES: OwnerBotCommandCategory[] = [
  "AGENDA",
  "CLIENTES",
  "FINANCEIRO",
  "EQUIPE",
  "SERVICOS",
  "MARKETING",
  "OPERACAO",
  "CONTA",
];

/**
 * Categorias sem publicidade: o escritório não recebe menu de marketing
 * (sem campanha, sem pedido de avaliação, sem nota média pública). A
 * consulta interna de clientes que não voltam continua existindo — é lista
 * para o dono, não disparo ao cliente.
 */
const NO_ADVERTISING_CATEGORIES: OwnerBotCommandCategory[] = BASE_CATEGORIES.filter(
  (category) => category !== "MARKETING"
);

const WITH_STOCK_CATEGORIES: OwnerBotCommandCategory[] = [...BASE_CATEGORIES, "ESTOQUE"];

function profile(
  capabilities: OwnerBotCapability[],
  highlights: string[],
  vocabulary: OwnerBotSegmentVocabulary,
  extra: Partial<OwnerBotSegmentProfile> = {}
): OwnerBotSegmentProfile {
  return {
    capabilities,
    highlights,
    categories: extra.categories ?? BASE_CATEGORIES,
    vocabulary,
    ...extra,
  };
}

export const OWNER_BOT_SEGMENT_PROFILES: Record<BusinessSegment, OwnerBotSegmentProfile> = {
  BARBERSHOP: profile(
    FULL_CAPABILITIES,
    [
      ...BASE_HIGHLIGHTS,
      "Fazer check-in de quem chegou",
      "Encerrar atendimento e chamar o próximo da fila",
      "Consultar faturamento, caixa e comissões",
    ],
    { todayNoun: "atendimentos de hoje", ticketUnit: "atendimento", clientsOfDay: "clientes de hoje" },
    { categories: WITH_STOCK_CATEGORIES }
  ),
  HAIR_SALON: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "serviços de hoje", ticketUnit: "serviço", clientsOfDay: "clientes de hoje" },
    { categories: WITH_STOCK_CATEGORIES }
  ),
  NAIL_STUDIO: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "atendimentos de hoje", ticketUnit: "atendimento", clientsOfDay: "clientes de hoje" },
    { categories: WITH_STOCK_CATEGORIES }
  ),
  PETSHOP: profile(
    FULL_CAPABILITIES,
    [
      ...BASE_HIGHLIGHTS,
      "Agendar cliente (o pet fica na ficha do cliente)",
      "Consultar faturamento, caixa e comissões",
    ],
    { todayNoun: "banhos de hoje", ticketUnit: "banho", clientsOfDay: "tutores de hoje", auxiliaryNoun: "pet" },
    { auxiliaryProfile: "pet", categories: WITH_STOCK_CATEGORIES }
  ),
  BEAUTY_STUDIO: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "atendimentos de hoje", ticketUnit: "atendimento", clientsOfDay: "clientes de hoje" },
    { categories: WITH_STOCK_CATEGORIES }
  ),
  LASH_BROW_STUDIO: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "atendimentos de hoje", ticketUnit: "atendimento", clientsOfDay: "clientes de hoje" },
    { categories: WITH_STOCK_CATEGORIES }
  ),
  AESTHETICS: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "sessões de hoje", ticketUnit: "sessão", clientsOfDay: "clientes de hoje" },
    { categories: WITH_STOCK_CATEGORIES }
  ),
  SPA: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "sessões de hoje", ticketUnit: "sessão", clientsOfDay: "clientes de hoje" },
    { categories: WITH_STOCK_CATEGORIES }
  ),
  MAKEUP_STUDIO: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "atendimentos de hoje", ticketUnit: "atendimento", clientsOfDay: "clientes de hoje" },
    { categories: WITH_STOCK_CATEGORIES }
  ),
  PHYSIOTHERAPY: profile(
    HEALTH_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "consultas de hoje", ticketUnit: "sessão", clientsOfDay: "pacientes de hoje" },
    { complianceNote: COMPLIANCE_NOTE }
  ),
  NUTRITION: profile(
    HEALTH_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "consultas de hoje", ticketUnit: "consulta", clientsOfDay: "pacientes de hoje" },
    { complianceNote: COMPLIANCE_NOTE }
  ),
  PSYCHOTHERAPY: profile(
    HEALTH_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "consultas de hoje", ticketUnit: "sessão", clientsOfDay: "pacientes de hoje" },
    { complianceNote: COMPLIANCE_NOTE }
  ),
  VETERINARY: profile(
    FULL_CAPABILITIES,
    [
      ...BASE_HIGHLIGHTS,
      "Agendar cliente (o pet fica na ficha do cliente)",
      "Consultar faturamento, caixa e comissões",
    ],
    { todayNoun: "consultas de hoje", ticketUnit: "consulta", clientsOfDay: "tutores de hoje", auxiliaryNoun: "pet" },
    { auxiliaryProfile: "pet", complianceNote: COMPLIANCE_NOTE, categories: WITH_STOCK_CATEGORIES }
  ),
  CAR_WASH: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "lavagens de hoje", ticketUnit: "lavagem", clientsOfDay: "clientes de hoje", auxiliaryNoun: "veículo" },
    { auxiliaryProfile: "vehicle" }
  ),
  AUTO_REPAIR: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "ordens do dia", ticketUnit: "ordem de serviço", clientsOfDay: "clientes de hoje", auxiliaryNoun: "veículo" },
    { auxiliaryProfile: "vehicle" }
  ),
  PHOTO_STUDIO: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "sessões de hoje", ticketUnit: "sessão", clientsOfDay: "clientes de hoje" }
  ),
  TATTOO_PIERCING: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "sessões de hoje", ticketUnit: "sessão", clientsOfDay: "clientes de hoje" }
  ),
  COACHING: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "atendimentos de hoje", ticketUnit: "sessão", clientsOfDay: "clientes de hoje" }
  ),
  PRIVATE_CLASSES: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "aulas de hoje", ticketUnit: "aula", clientsOfDay: "alunos de hoje" }
  ),
  TECH_SUPPORT: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "atendimentos de hoje", ticketUnit: "atendimento", clientsOfDay: "clientes de hoje" }
  ),
  HOME_SERVICES: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "serviços de hoje", ticketUnit: "serviço", clientsOfDay: "clientes de hoje" }
  ),
  LAW_FIRM: profile(
    OFFICE_CAPABILITIES,
    [
      "Ver os atendimentos de hoje",
      "Ver as audiências da semana",
      "Ver a agenda de amanhã",
      "Agendar um novo horário",
      "Cancelar ou remarcar um horário",
      "Registrar que o cliente chegou",
      "Encerrar atendimento e registrar o honorário",
      "Consultar faturamento, caixa e honorários",
      "Ver os próximos prazos do escritório",
      "Ver as tarefas abertas dos processos",
    ],
    {
      todayNoun: "atendimentos de hoje",
      ticketUnit: "atendimento",
      clientsOfDay: "clientes de hoje",
      hearingNoun: "audiência",
      hearingKeywords: ["audiencia"],
    },
    {
      categories: [...NO_ADVERTISING_CATEGORIES, "PROCESSOS"],
      hiddenCommands: [
        // Escritório não tem fila nem lista de espera.
        "queue.status",
        "waitlist.list",
        "waitlist.offer",
        "waitlist.remove",
        // Repository de honorários: sem comissão por atendimento.
        "fin.commissions",
        "team.commission",
        // Cupom é promoção: fora do segmentos com restrição de publicidade.
        "fin.vouchers",
      ],
      complianceNote:
        "O assistente organiza agenda, clientes e honorários. Não substitui a análise jurídica: valide com um advogado e com as regras da OAB aplicáveis qualquer conteúdo que você divulgar.",
      // Exemplos no tom do escritório — a "ajuda" não fala de corte nem de fila.
      descriptions: {
        "agenda.today": "Ver os atendimentos de hoje",
        "agenda.week": "Ver as audiências da semana",
        "agenda.next": "Próximo cliente na agenda",
        "agenda.free": "Horários livres",
        "appointment.schedule": "Agendar um novo horário",
        "appointment.checkin": "Registrar que o cliente chegou",
        "appointment.complete": "Encerrar atendimento",
        "case.deadlines": "Ver os próximos prazos",
        "case.tasks": "Ver as tarefas abertas",
        "case.pipeline": "Resumo dos processos",
      },
      examples: {
        "agenda.today": ["atendimentos de hoje", "o que tenho hoje"],
        "agenda.week": ["audiências da semana", "agenda dos próximos 7 dias"],
        "agenda.next": ["próximo cliente", "quem é o próximo"],
        "agenda.free": ["agenda de amanhã", "horários livres amanhã"],
        "agenda.late": ["clientes atrasados", "quem ainda não chegou"],
        "appointment.schedule": ["agendar um horário", "marcar audiência amanhã às 10h"],
        "appointment.cancel": ["cancelar o horário das 10h"],
        "appointment.reschedule": ["remarcar o horário do Pedro"],
        "appointment.checkin": ["o cliente chegou", "check-in da Maria"],
        "appointment.complete": ["encerrar atendimento", "finalizei a audiência do João"],
        "appointment.noshow": ["marcar falta do Pedro", "a Maria não veio"],
        "client.reminder": ["reenviar lembrete do horário de hoje"],
        "client.inactive": ["quem não vem há 45 dias", "clientes que não voltam"],
        "case.deadlines": ["quais os prazos", "prazos dos próximos 15 dias"],
        "case.tasks": ["quais as tarefas", "o que falta fazer"],
        "case.pipeline": ["quantos processos tenho", "resumo dos processos"],
      },
    }
  ),
  OTHER: profile(
    FULL_CAPABILITIES,
    [...BASE_HIGHLIGHTS, "Consultar faturamento, caixa e comissões"],
    { todayNoun: "atendimentos de hoje", ticketUnit: "atendimento", clientsOfDay: "clientes de hoje" },
    { categories: WITH_STOCK_CATEGORIES }
  ),
};

/** Perfil do segmento; segmento desconhecido cai em OTHER. */
export function getOwnerBotSegmentProfile(
  segment: BusinessSegment | null | undefined
): OwnerBotSegmentProfile {
  if (segment && OWNER_BOT_SEGMENT_PROFILES[segment]) {
    return OWNER_BOT_SEGMENT_PROFILES[segment];
  }
  return OWNER_BOT_SEGMENT_PROFILES.OTHER;
}

/** Vocabulário do segmento (reaproveita a fonte única do backend). */
export function getOwnerBotLabels(segment: BusinessSegment | null | undefined) {
  const config = segment ? SEGMENT_CONFIGS[segment] : SEGMENT_CONFIGS.OTHER;
  return config.labels;
}

/** A ação é suportada no segmento? */
export function ownerBotSupports(
  segment: BusinessSegment | null | undefined,
  capability: OwnerBotCapability
): boolean {
  return getOwnerBotSegmentProfile(segment).capabilities.includes(capability);
}

/** A categoria do menu existe no segmento? */
export function ownerBotHasCategory(
  segment: BusinessSegment | null | undefined,
  category: OwnerBotCommandCategory
): boolean {
  return getOwnerBotSegmentProfile(segment).categories.includes(category);
}
