import {
  parseEvolutionWebhook,
  verifyWebhookSecret,
  type EvolutionWebhookEvent,
} from "@/shared/services/evolutionWebhook";

/**
 * Webhook de entrada da Evolution API (instância da plataforma).
 *
 * A leitura do corpo e a comparação do segredo são compartilhadas com o
 * atendente de IA — o formato do payload é o mesmo.
 */

export type OwnerBotWebhookEvent = EvolutionWebhookEvent;

export { parseEvolutionWebhook, verifyWebhookSecret };

/** A instância do webhook é a instância da plataforma? */
export function isPlatformInstance(instanceName: string | undefined): boolean {
  const expected = process.env.EVOLUTION_INSTANCE_NAME?.trim();
  if (!expected) return false;
  if (!instanceName) return true;
  return instanceName === expected;
}
