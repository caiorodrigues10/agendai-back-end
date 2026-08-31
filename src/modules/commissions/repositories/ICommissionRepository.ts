import {
  ICommissionEntryDTO,
  ICommissionSplitDTO,
  IListCommissionsQuery,
  ICommissionSummary,
} from "../dtos/ICommissionDTO";

export interface ICommissionRepository {
  hasEntriesForQueueItem(queueItemId: string): Promise<boolean>;
  createForQueueItem(data: {
    barbershopId: string;
    queueItemId: string;
    serviceId: string;
    finalPrice: number;
    splits: ICommissionSplitDTO[];
  }): Promise<void>;
  list(
    barbershopId: string,
    query: IListCommissionsQuery,
  ): Promise<{ data: ICommissionEntryDTO[]; total: number }>;
  summary(
    barbershopId: string,
    query: Omit<IListCommissionsQuery, "page" | "limit">,
  ): Promise<ICommissionSummary>;
}
