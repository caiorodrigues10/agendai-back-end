export interface IJoinQueueDTO {
  barbershopId: string;
  serviceId: string;
  customerId: string;
  customerName: string;
  whatsapp: string;
  addedByStaff?: boolean;
  responsibleQueueItemId?: string;
}
