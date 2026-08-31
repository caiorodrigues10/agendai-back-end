export interface ICommissionSplitDTO {
  professionalId: string;
  percentage: number;
}

export interface ICommissionEntryDTO {
  id: string;
  barbershopId: string;
  queueItemId: string;
  serviceId: string;
  serviceName: string;
  professionalId: string;
  professionalName: string;
  percentage: number;
  amount: number;
  createdAt: Date;
}

export interface IListCommissionsQuery {
  from?: string;
  to?: string;
  professionalId?: string;
  page: number;
  limit: number;
}

export interface ICommissionSummary {
  grossTotal: number;
  commissionTotal: number;
  byProfessional: Array<{
    professionalId: string;
    professionalName: string;
    commissionTotal: number;
    entryCount: number;
  }>;
}
