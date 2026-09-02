export type OperationMode = 'QUEUE_ONLY' | 'APPOINTMENTS_ONLY' | 'HYBRID';

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
  createdAt: Date;
  active: boolean;
  /** Nome da instância Evolution — só o fluxo de connect/disconnect altera. */
  evolutionInstanceName?: string | null;
}
