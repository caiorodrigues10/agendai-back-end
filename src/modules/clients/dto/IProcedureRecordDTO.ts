export interface ICreateProcedureRecordDTO {
  barbershopId: string;
  clientId: string;
  professionalName: string;
  title: string;
  formula?: string | null;
  details?: string | null;
  serviceName?: string | null;
  queueItemId?: string | null;
  appointmentId?: string | null;
  occurredAt?: Date;
}

export interface IUpdateProcedureRecordDTO {
  professionalName?: string;
  title?: string;
  formula?: string | null;
  details?: string | null;
  serviceName?: string | null;
}

export interface IProcedureRecordResponseDTO {
  id: string;
  barbershopId: string;
  clientId: string;
  professionalName: string;
  title: string;
  formula: string | null;
  details: string | null;
  serviceName: string | null;
  queueItemId: string | null;
  appointmentId: string | null;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
