import type { SortInput } from "@/shared/utils/pagination";

export interface ICommissionSplitDTO {
  professionalId: string;
  percentage: number;
}

export interface ICommissionEntryDTO {
  id: string;
  barbershopId: string;
  queueItemId: string | null;
  appointmentId: string | null;
  /** Origem da comissão: fila (QUEUE) ou agenda (APPOINTMENT). */
  origin: "QUEUE" | "APPOINTMENT";
  serviceId: string;
  serviceName: string;
  professionalId: string;
  professionalName: string;
  percentage: number;
  amount: number;
  createdAt: Date;
}

/**
 * Filtros da listagem de comissões (sem paginação nem ordenação).
 *
 * `barbershopId` **nunca** faz parte deste tipo: ele vem sempre do contexto
 * da requisição e é passado como argumento separado ao repositório.
 */
export interface ICommissionFilters {
  /** YYYY-MM-DD — início do período em `createdAt` (inclusivo, dia civil). */
  from?: string;
  /** YYYY-MM-DD — fim do período em `createdAt` (exclusivo no dia seguinte). */
  to?: string;
  /** Profissional dono da comissão (uuid). */
  professionalId?: string;
  /** Serviço que gerou a comissão (uuid). */
  serviceId?: string;
  origin?: "QUEUE" | "APPOINTMENT";
  /**
   * Fuso do salão — `createdAt` é `DateTime` (timestamp), então o dia civil
   * do filtro `from`/`to` é o do salão, não o UTC.
   */
  timeZone?: string;
}

export interface IListCommissionsQuery extends ICommissionFilters {
  page: number;
  limit: number;
  /** Ordenação por `data` (createdAt) ou `valor` (amount). */
  sort?: SortInput;
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
