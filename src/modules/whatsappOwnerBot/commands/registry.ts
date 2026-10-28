import { agendaCommands } from "./agendaCommands";
import { clientCommands } from "./clientCommands";
import { financialCommands } from "./financialCommands";
import { staffCommands } from "./staffCommands";
import { inventoryCommands } from "./inventoryCommands";
import { serviceCommands } from "./serviceCommands";
import { marketingCommands } from "./marketingCommands";
import { operationCommands } from "./operationCommands";
import { accountCommands } from "./accountCommands";
import { helpCommands } from "./helpCommands";
import type { OwnerBotCommand, OwnerBotRiskClass } from "./types";

/**
 * Registry de comandos do assistente.
 *
 * Cada comando declara: id, categoria, classe de risco, gatilhos de
 * linguagem natural, exemplos e um handler fino que chama os use cases do
 * app. Nenhum comando fica sem classificação de risco — o teste
 * `commandRegistry.spec.ts` garante isso.
 */
export const OWNER_BOT_COMMANDS: OwnerBotCommand[] = [
  ...agendaCommands,
  ...clientCommands,
  ...financialCommands,
  ...staffCommands,
  ...inventoryCommands,
  ...serviceCommands,
  ...marketingCommands,
  ...operationCommands,
  ...accountCommands,
  ...helpCommands,
];

/** Índice por id (execução após confirmação). */
export const OWNER_BOT_COMMANDS_BY_ID: Record<string, OwnerBotCommand> = Object.fromEntries(
  OWNER_BOT_COMMANDS.map((command) => [command.id, command])
);

/** Classe de risco por comando — usada na auditoria e na confirmação. */
export const OWNER_BOT_COMMAND_RISK: Record<string, OwnerBotRiskClass> = Object.fromEntries(
  OWNER_BOT_COMMANDS.map((command) => [command.id, command.risk])
);

export function getOwnerBotCommand(id: string): OwnerBotCommand | undefined {
  return OWNER_BOT_COMMANDS_BY_ID[id];
}

export * from "./types";
export * from "./catalog";
export { matchOwnerBotCommand, commandApplies } from "./matcher";
export { resolveOwnerBotPeriod, ownerBotToday } from "./periods";
export { formatBRL, formatBRLShort, formatPercent } from "./money";
export {
  extractOwnerBotAmount,
  extractOwnerBotPersonName,
  extractOwnerBotPhone,
  extractOwnerBotServiceName,
  extractOwnerBotSubject,
} from "./extractors";
