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
  commands: OwnerBotCommand[]
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
        description: command.description,
        examples: command.examples,
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
    (command) => commandApplies(command, segment) && profile.categories.includes(command.category)
  );
  return buildOwnerBotCommandCatalog(allowed);
}
