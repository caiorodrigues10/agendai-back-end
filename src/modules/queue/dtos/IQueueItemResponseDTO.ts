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
  addedByStaff?: boolean;
  completedAt?: number | null;
  completedBy?: string | null;
  finalPrice?: number | null;
  serviceName?: string | null;
}
