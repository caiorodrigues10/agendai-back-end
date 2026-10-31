import { getModuleLogger } from "@/shared/utils/logger";

/**
 * Roteamento da instância Evolution que chegou no webhook do atendente de IA.
 *
 * - `ai_line` — instância compartilhada (`EVOLUTION_AI_INSTANCE_NAME`): o salão
 *   é resolvido pelo número do cliente;
 * - `shop` — instância `shop-<barbershopId>`: o salão é o dono do número;
 * - `ignored` — instância de outro produto (o assistente do dono, por exemplo).
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const logger = getModuleLogger("whatsapp-ai:webhook");

export type AiInstanceRoute =
  | { kind: "ai_line" }
  | { kind: "shop"; barbershopId: string }
  | { kind: "ignored"; reason: string };

export function resolveAiInstanceRoute(instanceName: string | undefined): AiInstanceRoute {
  const name = instanceName?.trim();
  if (!name) return { kind: "ignored", reason: "instância não informada" };

  const aiInstance = process.env.EVOLUTION_AI_INSTANCE_NAME?.trim();
  const platformInstance = process.env.EVOLUTION_INSTANCE_NAME?.trim();

  if (platformInstance && name === platformInstance && name !== aiInstance) {
    return { kind: "ignored", reason: "instância da plataforma (assistente do dono)" };
  }

  if (aiInstance && name === aiInstance) {
    if (platformInstance && aiInstance === platformInstance) {
      logger.warn(
        { instanceName: name },
        "A instância da IA é a mesma da plataforma — o assistente do dono também pode responder"
      );
    }
    return { kind: "ai_line" };
  }

  if (name.startsWith("shop-")) {
    const barbershopId = name.slice("shop-".length);
    if (!UUID_PATTERN.test(barbershopId)) {
      return { kind: "ignored", reason: "instância de salão inválida" };
    }
    return { kind: "shop", barbershopId };
  }

  return { kind: "ignored", reason: "instância não atendida pelo atendente de IA" };
}
