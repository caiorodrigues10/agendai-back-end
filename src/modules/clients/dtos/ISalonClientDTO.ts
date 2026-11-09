import type { SortInput } from "@/shared/utils/pagination";

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
  /** Intervalo civil de criação (YYYY-MM-DD). */
  createdFrom?: string;
  createdTo?: string;
  /** Sem visita há N dias. */
  inactiveDays?: number;
  /** Filtra clientes com (true) ou sem (false) fiado em aberto. */
  hasOpenFiado?: boolean;
  /** Filtra clientes com (true) ou sem (false) pacote ativo. */
  hasActivePackage?: boolean;
  /** Ordenação por whitelist (name | lastVisitAt | createdAt). */
  sort?: SortInput;
  /** Fuso do salão — o dia civil de `createdAt` é o do salão. */
  timeZone?: string;
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
