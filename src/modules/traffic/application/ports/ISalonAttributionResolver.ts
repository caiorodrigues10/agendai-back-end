import type { SalonTrafficIdentifierType } from "../../domain/salonTraffic";

/**
 * Resultado da resolução do identificador público de um salão.
 *
 * `target` é a chave de contagem no Redis/PostgreSQL (`b:<uuid>` para salão,
 * `o:<uuid>` para organização) — o identificador público nunca é gravado.
 */
export interface SalonTrafficAttribution {
  kind: "barbershop" | "organization";
  /** UUID do barbershop ou da organização resolvida. */
  id: string;
  /** Chave de contagem (escopo do dado). */
  target: string;
}

/**
 * Porta de resolução do `salon` + `salonType` do ping.
 *
 * DECISÃO PENDENTE (contrato, seção "Resolução de id e slug"):
 * a opção 1 — atribuir o ping à ORGANIZAÇÃO — está implementada em
 * `PrismaSalonAttributionResolver`. A resolução fica isolada em um único
 * adapter para que a troca de decisão (atribuir à unidade principal, ignorar
 * pings ambíguos, etc.) não afete o resto do módulo.
 */
export interface ISalonAttributionResolver {
  /**
   * Resolve o identificador público em um alvo de atribuição.
   * Retorna `null` quando o salão/organização não existe (o ping é
   * descartado silenciosamente — a resposta do beacon é sempre 204).
   */
  resolve(
    salon: string,
    salonType: SalonTrafficIdentifierType,
  ): Promise<SalonTrafficAttribution | null>;
}
