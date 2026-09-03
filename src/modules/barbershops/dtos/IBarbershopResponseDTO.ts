export type OperationMode = 'QUEUE_ONLY' | 'APPOINTMENTS_ONLY' | 'HYBRID';
export type ManualShopStatus = 'AUTO' | 'OPEN' | 'CLOSED';
export type OpeningMode = 'SCHEDULE' | 'MANUAL';
export type BusinessSegment =
  | 'BARBERSHOP'
  | 'HAIR_SALON'
  | 'BEAUTY_STUDIO'
  | 'NAIL_STUDIO'
  | 'LASH_BROW_STUDIO'
  | 'AESTHETICS'
  | 'SPA'
  | 'OTHER';

export interface ShopOpenStateDTO {
  open: boolean;
  reason: string;
  queueClosed: boolean;
}

export interface ScheduleExceptionDTO {
  id: string;
  date: string;
  isOpen: boolean;
  reason: string | null;
}

export interface IBarbershopResponseDTO {
  id: string;
  name: string;
  whatsapp: string;
  logoUrl?: string | null;
  cnpj?: string | null;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  operationMode: OperationMode;
  openingMode?: OpeningMode;
  businessSegment?: BusinessSegment;
  manualStatus?: ManualShopStatus;
  createdAt: Date;
  active: boolean;
  /** Nome da instância Evolution — só o fluxo de connect/disconnect altera. */
  evolutionInstanceName?: string | null;
  openState?: ShopOpenStateDTO;
  scheduleExceptions?: ScheduleExceptionDTO[];
}
