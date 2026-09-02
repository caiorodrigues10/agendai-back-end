import { CrmClientMetrics, CrmOverviewDTO, CrmSegment } from "../dtos/ICrmDTO";

export interface ICrmRepository {
  overview(barbershopId: string, from: Date, to: Date, compare: boolean): Promise<CrmOverviewDTO>;
  listClients(barbershopId: string, params: { page: number; limit: number; search?: string; segment?: CrmSegment; sort?: "ltv" | "lastVisit" | "outstanding"; from?: Date; to?: Date }): Promise<{ data: CrmClientMetrics[]; total: number }>;
  getClientProfile(barbershopId: string, clientId: string, period?: { from?: Date; to?: Date }): Promise<Record<string, unknown> | null>;
  mergeClients(barbershopId: string, targetId: string, sourceIds: string[]): Promise<void>;
}
