import { sendWhatsAppMessageDetailed } from "@/shared/services/evolutionApiService";
import { getModuleLogger } from "@/shared/utils/logger";

/**
 * Envio das respostas do assistente.
 *
 * As respostas ao dono SEMPRE saem pela instância da PLATAFORMA
 * (`EVOLUTION_INSTANCE_NAME`) — nunca pela instância da loja (`shop-*`).
 * Assim o dono conversa com o número da plataforma, e não com o WhatsApp
 * da própria barbearia.
 */

const logger = getModuleLogger("owner-bot:messenger");

export interface OwnerBotMessenger {
  send(phone: string, text: string): Promise<boolean>;
}

export class EvolutionOwnerBotMessenger implements OwnerBotMessenger {
  async send(phone: string, text: string): Promise<boolean> {
    const result = await sendWhatsAppMessageDetailed(phone, text, { platform: true });
    if (!result.ok) {
      logger.warn(
        { errorCode: result.errorCode, httpStatus: result.httpStatus },
        "Falha ao enviar resposta do assistente"
      );
    }
    return result.ok;
  }
}
