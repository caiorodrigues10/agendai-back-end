import { sendWhatsAppMessageDetailed } from "@/shared/services/evolutionApiService";
import { getModuleLogger } from "@/shared/utils/logger";
import { maskAiPhone } from "./whatsappAiPhone";

/**
 * Envio das respostas do atendente de IA.
 *
 * A resposta sai pela MESMA instância em que o cliente escreveu:
 * - instância `shop-<id>` → o número do próprio salão (a conversa continua lá);
 * - instância da IA (`EVOLUTION_AI_INSTANCE_NAME`) → o número compartilhado.
 *
 * Sem `instanceName`, cai na instância da plataforma — que é do assistente do
 * dono, então o serviço só usa esse caminho quando explicitamente configurado.
 */

const logger = getModuleLogger("whatsapp-ai:messenger");

export const AI_MAX_MESSAGE_LENGTH = 1500;

export interface WhatsAppAiMessenger {
  send(phone: string, text: string, instanceName?: string): Promise<boolean>;
}

/** Divide textos longos em partes (o WhatsApp corta acima de ~1500 caracteres). */
export function splitAiMessage(text: string, max = AI_MAX_MESSAGE_LENGTH): string[] {
  const normalized = (text ?? "").trim();
  if (!normalized) return [];
  if (normalized.length <= max) return [normalized];

  const parts: string[] = [];
  let remaining = normalized;
  while (remaining.length > max) {
    const cut = remaining.lastIndexOf("\n", max);
    const index = cut > 0 ? cut : max;
    parts.push(remaining.slice(0, index).trimEnd());
    remaining = remaining.slice(index).trimStart();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

export class EvolutionWhatsAppAiMessenger implements WhatsAppAiMessenger {
  async send(phone: string, text: string, instanceName?: string): Promise<boolean> {
    const parts = splitAiMessage(text);
    if (parts.length === 0) return false;

    let allSent = true;
    for (const part of parts) {
      const result = instanceName
        ? await sendWhatsAppMessageDetailed(phone, part, { instanceName })
        : await sendWhatsAppMessageDetailed(phone, part, { platform: true });

      if (!result.ok) {
        allSent = false;
        logger.warn(
          {
            phone: maskAiPhone(phone),
            instanceName: instanceName ?? "platform",
            errorCode: result.errorCode,
            httpStatus: result.httpStatus,
          },
          "Falha ao enviar resposta do atendente de IA"
        );
      }
    }
    return allSent;
  }
}
