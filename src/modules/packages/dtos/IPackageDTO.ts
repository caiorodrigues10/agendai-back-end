export type PackagePaymentMethod = "cash" | "pix" | "card" | "other";
export type ClientPackageStatus = "ACTIVE" | "DEPLETED" | "EXPIRED" | "CANCELLED";

export interface ICreateServicePackageDTO {
  barbershopId: string;
  serviceId: string;
  name: string;
  sessionCount: number;
  price: number;
  validityDays?: number | null;
}

export interface IUpdateServicePackageDTO {
  name?: string;
  serviceId?: string;
  sessionCount?: number;
  price?: number;
  validityDays?: number | null;
  active?: boolean;
}

export interface IServicePackageResponseDTO {
  id: string;
  barbershopId: string;
  serviceId: string;
  serviceName: string | null;
  servicePrice: number | null;
  name: string;
  sessionCount: number;
  price: number;
  validityDays: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISellClientPackageDTO {
  barbershopId: string;
  clientId: string;
  packageId: string;
  paymentMethod: PackagePaymentMethod;
  soldById?: string | null;
}

export interface IClientPackageResponseDTO {
  id: string;
  barbershopId: string;
  clientId: string;
  clientName: string | null;
  clientWhatsapp: string | null;
  packageId: string;
  packageName: string | null;
  serviceId: string;
  serviceName: string | null;
  serviceDurationMinutes: number | null;
  totalSessions: number;
  remainingSessions: number;
  pricePaid: number;
  paymentMethod: PackagePaymentMethod;
  status: ClientPackageStatus;
  purchasedAt: Date;
  expiresAt: Date | null;
  soldById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBookPackageSlotDTO {
  date: string;
  time: string;
  staffId?: string | null;
}

export interface IPackageSalesSummary {
  count: number;
  totalPaid: number;
}
