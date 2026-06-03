import { QueueStatus } from "./IQueueItemResponseDTO";

export interface IUpdateQueueItemDTO {
  status: QueueStatus;
  completedBy?: string;
}
