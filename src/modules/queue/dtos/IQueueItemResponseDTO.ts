export type QueueStatus = "waiting" | "in_chair" | "completed" | "cancelled";

export interface IQueueItemResponseDTO {
  id: string;
  barbershopId: string;
  serviceId: string;
  customerId: string;
  customerName: string;
  whatsapp: string;
  joinedAt: number;
  status: QueueStatus;
  estimatedStartAt?: number | null;
  /** Última posição notificada ao cliente (evita reenvio se a posição não mudou). */
  lastNotifiedPosition?: number | null;
  addedByStaff?: boolean;
  completedAt?: number | null;
  completedBy?: string | null;
  finalPrice?: number | null;
  serviceName?: string | null;
  /** Duração média do serviço em minutos (paralista True do service.avgTimeMinutes). */
  serviceAvgTimeMinutes?: number | null;
}
