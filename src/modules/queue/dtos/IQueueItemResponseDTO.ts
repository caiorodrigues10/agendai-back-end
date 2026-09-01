export type QueueStatus = "waiting" | "in_chair" | "completed" | "cancelled";

export interface IQueueItemResponseDTO {
  id: string;
  barbershopId: string;
  serviceId: string;
  customerId: string;
  clientId?: string | null;
  customerName: string;
  whatsapp: string;
  joinedAt: number;
  calledAt?: number | null;
  status: QueueStatus;
  estimatedStartAt?: number | null;
  /** Última posição notificada ao cliente (evita reenvio se a posição não mudou). */
  lastNotifiedPosition?: number | null;
  addedByStaff?: boolean;
  responsibleQueueItemId?: string | null;
  responsibleName?: string | null;
  /** Usado apenas para reconhecer dependentes na sessão pública; nunca deve ser exposto. */
  responsibleCustomerId?: string | null;
  completedAt?: number | null;
  completedBy?: string | null;
  finalPrice?: number | null;
  paymentMethod?: string | null;
  serviceName?: string | null;
  /** Duração média do serviço em minutos (paralista True do service.avgTimeMinutes). */
  serviceAvgTimeMinutes?: number | null;
}
