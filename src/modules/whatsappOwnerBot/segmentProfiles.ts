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
