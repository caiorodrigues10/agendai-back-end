export interface IJoinQueueDTO {
  barbershopId: string;
  serviceId: string;
  customerId: string;
  customerName: string;
  whatsapp: string;
  addedByStaff?: boolean;
  responsibleQueueItemId?: string;
  activeIdentityKey?: string;
  /** Pet escolhido (MVP petshop). O nome é resolvido no backend. */
  petId?: string | null;
  petName?: string | null;
}
