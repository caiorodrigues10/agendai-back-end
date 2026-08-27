import { fetchEvolutionConnectionState } from "@/shared/services/evolutionApiService";
import { whatsAppNotConnectedError } from "./shopEvolutionInstance";

/**
 * Garante instância do salão aberta na Evolution antes de enqueue manual (Avisar).
 * Sem nome ou estado !== open → 409 WHATSAPP_NOT_CONNECTED.
 */
export async function requireOpenShopWhatsAppInstance(
  shop: { evolutionInstanceName?: string | null } | null | undefined
): Promise<string> {
  const instanceName = shop?.evolutionInstanceName?.trim();
  if (!instanceName) throw whatsAppNotConnectedError();

  const state = await fetchEvolutionConnectionState(instanceName);
  if (state !== "open") throw whatsAppNotConnectedError();
  return instanceName;
}
