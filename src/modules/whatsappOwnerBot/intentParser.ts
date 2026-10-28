import { normalizeText } from "./dateParser";
import type { OwnerBotIntent } from "./types";

/**
 * Interpretação da mensagem do dono.
 *
 * Determinístico e previsível: o mesmo texto sempre cai no mesmo intent.
 * A escolha por número ("1", "2") depende do contexto (lista exibida ou
 * confirmação), então ela é tratada no serviço, não aqui.
 */

const LINK_CODE_PATTERN = /(?:vincular|ligar|codigo)\s+([a-z0-9]{6})/;
/** Código solto: 6 caracteres alfanuméricos com pelo menos um número. */
const BARE_CODE_PATTERN = /^(?=.*\d)([a-z0-9]{6})$/;

export function parseOwnerBotIntent(raw: string): OwnerBotIntent {
  const text = normalizeText(raw);
  if (!text) return { type: "UNKNOWN" };

  const linkWithKeyword = text.match(LINK_CODE_PATTERN);
  if (linkWithKeyword) return { type: "LINK_CODE", code: linkWithKeyword[1].toUpperCase() };

  if (/\b(desvincular|desligar|sair|remover vinculo)\b/.test(text)) {
    return { type: "UNLINK" };
  }

  if (/^(sim|s|yes|confirmo|confirma|pode ser|ok|okay)$/.test(text)) {
    return { type: "CONFIRM" };
  }
  if (/^(nao|n|no|nunca)$/.test(text)) {
    return { type: "DENY" };
  }

  // Número é escolha de lista — o contexto (confirmação ou lista) decide o
  // que "1" significa.
  const selection = text.match(/^(\d{1,2})$/);
  if (selection) {
    return { type: "SELECT", index: Number(selection[1]) };
  }

  if (/\b(ajuda|help|comandos|o que voce pode|como funciona)\b/.test(text)) {
    return { type: "HELP" };
  }
  if (/\b(trocar de unidade|trocar unidade|outra unidade|unidades|outro salao|outro estabelecimento)\b/.test(text)) {
    return { type: "SWITCH_SHOP" };
  }
  if (/\b(encerrar|finalizar|terminar atendimento|concluir)\b/.test(text)) {
    return { type: "COMPLETE" };
  }
  if (/\b(nao compareceu|nao veio|falta|no show|noshow|desistiu)\b/.test(text)) {
    return { type: "NO_SHOW" };
  }
  if (/\b(check in|check-in|chegou|chegada)\b/.test(text)) {
    return { type: "CHECK_IN" };
  }
  if (/\b(encaixe|walk in|walk-in|entrar na fila|fila)\b/.test(text)) {
    return { type: "WALK_IN" };
  }
  if (/\b(remarcar|mudar horario|mudar a data|mudar data|reagendar)\b/.test(text)) {
    return { type: "RESCHEDULE" };
  }
  if (/\b(cancelar|cancele|remover horario)\b/.test(text)) {
    return { type: "CANCEL" };
  }
  if (/\b(agendar|agende|novo agendamento|marcar horario|marcar)\b/.test(text)) {
    return { type: "SCHEDULE" };
  }
  if (/\b(agenda|horarios de hoje|meus horarios|listar agenda|consultar agenda)\b/.test(text)) {
    return { type: "AGENDA" };
  }
  if (/^(oi|ola|opa|eae|bom dia|boa tarde|boa noite|belo dia)\b/.test(text)) {
    return { type: "GREETING" };
  }

  const bareCode = text.match(BARE_CODE_PATTERN);
  if (bareCode) return { type: "LINK_CODE", code: bareCode[1].toUpperCase() };

  return { type: "UNKNOWN" };
}
