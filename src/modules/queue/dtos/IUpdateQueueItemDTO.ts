import { QueueStatus } from "./IQueueItemResponseDTO";

export interface IUpdateQueueItemDTO {
  status: QueueStatus;
  completedBy?: string;
  paymentMethod?: "pix" | "credit_card" | "debit_card" | "fiado";
}
