export interface ICreateSalonClientDTO {
  barbershopId: string;
  name: string;
  whatsapp?: string;
  notes?: string | null;
  marketingOptIn?: boolean;
  marketingOptInSource?: string | null;
}

export interface IUpdateSalonClientDTO {
  name?: string;
  whatsapp?: string;
  marketingOptIn?: boolean;
  marketingOptInSource?: string | null;
  notes?: string | null;
}

export interface ISalonClientListQuery {
  page: number;
  limit: number;
  search?: string;
}

export interface ISalonClientAppointmentDTO {
  id: string;
  serviceId: string;
  serviceName: string | null;
  date: Date;
  time: string;
  status: string;
  clientPackageId: string | null;
}

export interface ISalonClientPackageSummaryDTO {
  id: string;
  packageId: string;
  packageName: string | null;
  serviceId: string;
  serviceName: string | null;
  totalSessions: number;
  remainingSessions: number;
  status: string;
  purchasedAt: Date;
  expiresAt: Date | null;
  pricePaid: number;
  paymentMethod: string;
}

export interface ISalonClientResponseDTO {
  id: string;
  barbershopId: string;
  name: string;
  whatsapp: string;
  normalizedWhatsapp?: string | null;
  notes: string | null;
  marketingOptIn?: boolean;
  marketingOptInAt?: Date | null;
  marketingOptInSource?: string | null;
  createdAt: Date;
  updatedAt: Date;
  remainingSessions: number;
  activePackageCount: number;
  packages?: ISalonClientPackageSummaryDTO[];
  appointments?: ISalonClientAppointmentDTO[];
}
