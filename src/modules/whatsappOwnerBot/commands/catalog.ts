import type { BusinessSegment } from "@prisma/client";
import { getOwnerBotSegmentProfile } from "../segmentProfiles";
import { commandApplies } from "./matcher";
import type { OwnerBotCommand, OwnerBotCommandCategory, OwnerBotRiskClass } from "./types";

/**
 * Catálogo de comandos do assistente — usado no menu, na ajuda e na seção
 * do app (front). É a mesma fonte para os três lugares.
 */

export const OWNER_BOT_CATEGORY_LABELS: Record<OwnerBotCommandCategory, string> = {
  AGENDA: "Agenda",
  CLIENTES: "Clientes",
  PROCESSOS: "Processos",
  FINANCEIRO: "Financeiro",
  EQUIPE: "Equipe",
  ESTOQUE: "Estoque",
  SERVICOS: "Serviços",
  MARKETING: "Marketing",
  OPERACAO: "Operação",
  CONTA: "Conta",
};

export const OWNER_BOT_CATEGORY_ORDER: OwnerBotCommandCategory[] = [
  "AGENDA",
  "CLIENTES",
  "PROCESSOS",
  "FINANCEIRO",
  "EQUIPE",
  "ESTOQUE",
  "SERVICOS",
  "MARKETING",
  "OPERACAO",
  "CONTA",
];

export const OWNER_BOT_RISK_LABELS: Record<OwnerBotRiskClass, string> = {
  READ: "Consulta",
  WRITE: "Ação com confirmação",
  SENSITIVE: "Ação sensível",
};

export type OwnerBotCommandCatalogItem = {
  id: string;
  category: OwnerBotCommandCategory;
  categoryLabel: string;
  risk: OwnerBotRiskClass;
  riskLabel: string;
  description: string;
  examples: string[];
};

export type OwnerBotCommandCatalog = {
  categories: Array<{
    id: OwnerBotCommandCategory;
    label: string;
    commands: OwnerBotCommandCatalogItem[];
  }>;
  total: number;
};

/** Catálogo completo (todos os segmentos). */
export function buildOwnerBotCommandCatalog(
  commands: OwnerBotCommand[],
  examplesByCommand?: Record<string, string[]>,
  descriptionsByCommand?: Record<string, string>
): OwnerBotCommandCatalog {
  const categories = OWNER_BOT_CATEGORY_ORDER.map((category) => ({
    id: category,
    label: OWNER_BOT_CATEGORY_LABELS[category],
    commands: commands
      .filter((command) => command.category === category)
      .map((command) => ({
        id: command.id,
        category: command.category,
        categoryLabel: OWNER_BOT_CATEGORY_LABELS[command.category],
        risk: command.risk,
        riskLabel: OWNER_BOT_RISK_LABELS[command.risk],
        description: descriptionsByCommand?.[command.id] ?? command.description,
        examples: examplesByCommand?.[command.id] ?? command.examples,
      })),
  })).filter((category) => category.commands.length > 0);

  return {
    categories,
    total: commands.length,
  };
}

/** Catálogo do segmento (esconde o que não se aplica). */
export function buildOwnerBotSegmentCatalog(
  commands: OwnerBotCommand[],
  segment: BusinessSegment | null | undefined
): OwnerBotCommandCatalog {
  const profile = getOwnerBotSegmentProfile(segment);
  const allowed = commands.filter(
    (command) =>
      commandApplies(command, segment) &&
      profile.categories.includes(command.category) &&
      !profile.hiddenCommands?.includes(command.id)
  );
  return buildOwnerBotCommandCatalog(allowed, profile.examples, profile.descriptions);
}

/**
 * Comandos que o assistente aceita no segmento: os do registry que se
 * aplicam ao segmento, estão nas categorias liberadas e não estão
 * bloqueados pelo perfil. É a mesma lista do menu — o que não está no menu
 * não é executado por texto.
 */
export function ownerBotCommandsForSegment(
  commands: OwnerBotCommand[],
  segment: BusinessSegment | null | undefined
): OwnerBotCommand[] {
  const profile = getOwnerBotSegmentProfile(segment);
  return commands.filter(
    (command) =>
      commandApplies(command, segment) &&
      profile.categories.includes(command.category) &&
      !profile.hiddenCommands?.includes(command.id)
  );
}

/** Exemplos do comando no tom do segmento (cai no genérico quando não há). */
export function ownerBotCommandExamples(
  command: OwnerBotCommand,
  segment: BusinessSegment | null | undefined
): string[] {
  const profile = getOwnerBotSegmentProfile(segment);
  return profile.examples?.[command.id] ?? command.examples;
}
