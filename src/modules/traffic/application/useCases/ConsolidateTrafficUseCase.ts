import { inject, injectable } from "tsyringe";
import type { ITrafficConsolidationRepository } from "../ports/ITrafficConsolidationRepository";
import type { ITrafficConsolidationSource } from "../ports/ITrafficConsolidationSource";

export const TRAFFIC_CONSOLIDATION_SOURCE = "TrafficConsolidationSource";
export const TRAFFIC_CONSOLIDATION_REPOSITORY = "TrafficConsolidationRepository";

/**
 * Move os contadores acumulados no Redis para os agregados do PostgreSQL.
 *
 * A aplicação coordena apenas; leitura do Redis e SQL ficam atrás de portas.
 * A consolidação é idempotente: o adapter usa GREATEST e nunca reduz um valor
 * já persistido.
 */
@injectable()
export class ConsolidateTrafficUseCase {
  constructor(
    @inject(TRAFFIC_CONSOLIDATION_SOURCE)
    private readonly source: ITrafficConsolidationSource,
    @inject(TRAFFIC_CONSOLIDATION_REPOSITORY)
    private readonly repository: ITrafficConsolidationRepository,
  ) {}

  async execute(dayKey: string) {
    const snapshot = await this.source.readDay(dayKey);
    return this.repository.persistDay(snapshot);
  }
}
