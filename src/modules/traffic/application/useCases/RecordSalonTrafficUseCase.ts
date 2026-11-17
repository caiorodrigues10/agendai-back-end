import { inject, injectable } from "tsyringe";
import {
  evaluateBeaconRequest,
  type BeaconRequestMetadata,
} from "../../domain/beaconRequest";
import { spDayKey, spHour } from "../../domain/periodWindows";
import {
  deriveSalonSection,
  type SalonTrafficIdentifierType,
  type SalonTrafficKind,
  type SalonTrafficRoute,
  type SalonTrafficSection,
  type SalonTrafficTab,
} from "../../domain/salonTraffic";
import type { TrafficArea } from "../../domain/trafficAreas";
import { incrementRedisUnavailableDrop } from "../../lossCounters";
import {
  TRAFFIC_COUNTER,
} from "./RecordVisitUseCase";
import type { ITrafficCounter } from "../ports/ITrafficCounter";
import type { ISalonAttributionResolver } from "../ports/ISalonAttributionResolver";

export const SALON_TRAFFIC_ATTRIBUTION_RESOLVER = "SalonTrafficAttributionResolver";

/** Atribuição enviada pelo cliente (já validada pelo schema). */
export interface SalonTrafficAttributionRequest {
  /** Padrão literal da rota pública (`/queue/:id`, …). */
  route: SalonTrafficRoute;
  /** Identificador público (UUID ou slug) — nunca persistido. */
  salon: string;
  salonType: SalonTrafficIdentifierType;
  /** `visit` = carregamento da página; `tab` = troca de aba. */
  kind: SalonTrafficKind;
  /** Aba visível (fora da allowlist → ausente). */
  tab?: SalonTrafficTab;
}

export interface RecordSalonTrafficRequest extends BeaconRequestMetadata {
  salon: SalonTrafficAttributionRequest;
}

export type RecordSalonTrafficResult =
  | {
      counted: true;
      area: TrafficArea;
      section: SalonTrafficSection;
      /** Chave de atribuição (`b:<uuid>` / `o:<uuid>`). */
      target: string;
    }
  | {
      counted: false;
      reason:
        | "disabled"
        | "excluded"
        | "rate_limited"
        | "counter_error"
        | "salon_unresolved";
    };

/**
 * Ingere um ping de página pública de salão.
 *
 * Contagem (contrato):
 *   - `visit`  → 1 visita + 1 visitante (hash diário distinto) do salão;
 *   - `tab`    → NUNCA soma visita/visitante: alimenta só a quebra por seção;
 *   - a aba de um `visit` também alimenta a seção correspondente.
 *
 * Privacidade:
 *   - a identidade é o hash HMAC diário de IP+UA (`visitorIdentity.ts`);
 *   - IP/UA nunca são gravados nem logados; o motivo do descarte é um enum
 *     fechado e a resposta HTTP é sempre 204 (sem sinal de enumeração).
 */
@injectable()
export class RecordSalonTrafficUseCase {
  constructor(
    @inject(TRAFFIC_COUNTER) private readonly counter: ITrafficCounter,
    @inject(SALON_TRAFFIC_ATTRIBUTION_RESOLVER)
    private readonly resolver: ISalonAttributionResolver,
  ) {}

  async execute(
    request: RecordSalonTrafficRequest,
    now: Date = new Date(),
  ): Promise<RecordSalonTrafficResult> {
    const decision = evaluateBeaconRequest(request);
    if (!decision.accepted) return { counted: false, reason: decision.reason };

    try {
      const allowed = await this.counter.consumeRateLimit(request.ip);
      if (!allowed) return { counted: false, reason: "rate_limited" };

      // Salão inexistente (ou indisponível) → descarte silencioso: mesma
      // resposta 204 de um ping válido, para não permitir enumeração de ids.
      const attribution = await this.resolveAttribution(request.salon);
      if (!attribution) return { counted: false, reason: "salon_unresolved" };

      const section = deriveSalonSection(request.salon.route, request.salon.tab);
      const dayKey = spDayKey(now);
      const hour = spHour(now);

      await this.counter.recordSalonVisit({
        target: attribution.target,
        section,
        kind: request.salon.kind,
        ip: request.ip,
        userAgent: request.userAgent ?? "",
        dayKey,
        hour,
        originHost: decision.originHost,
      });

      if (request.salon.kind === "visit") {
        // A página pública do salão também é uma visita do site: o relatório
        // master continua recebendo o mesmo volume de antes do beacon com
        // atribuição (área `salon_public`). Falha aqui não invalida a
        // contagem do salão (Redis é o mesmo, mas as escritas são isoladas).
        try {
          await this.counter.recordVisit({
            area: decision.area,
            ip: request.ip,
            userAgent: request.userAgent ?? "",
            dayKey,
            hour,
            originHost: decision.originHost,
          });
        } catch {
          incrementRedisUnavailableDrop();
        }
      }

      return {
        counted: true,
        area: decision.area,
        section,
        target: attribution.target,
      };
    } catch {
      // Redis (ou o contador) indisponível: perda aceita + métrica.
      incrementRedisUnavailableDrop();
      return { counted: false, reason: "counter_error" };
    }
  }

  /** Falha de banco ao resolver o salão também é descarte silencioso. */
  private async resolveAttribution(
    salon: SalonTrafficAttributionRequest,
  ): Promise<{ target: string } | null> {
    try {
      return await this.resolver.resolve(salon.salon, salon.salonType);
    } catch {
      return null;
    }
  }
}
