import {
  IClientPackageResponseDTO,
  IPackageSalesSummary,
  PackagePaymentMethod,
} from "../dtos/IPackageDTO";

export interface ICreateClientPackageRecord {
  barbershopId: string;
  clientId: string;
  packageId: string;
  serviceId: string;
  totalSessions: number;
  remainingSessions: number;
  pricePaid: number;
  paymentMethod: PackagePaymentMethod;
  expiresAt?: Date | null;
  soldById?: string | null;
}

export interface IClientPackageRepository {
  create(data: ICreateClientPackageRecord): Promise<IClientPackageResponseDTO>;
  findById(id: string): Promise<IClientPackageResponseDTO | null>;
  list(params: {
    barbershopId: string;
    clientId?: string;
    status?: IClientPackageResponseDTO["status"];
  }): Promise<IClientPackageResponseDTO[]>;
  debitSessions(id: string, count: number): Promise<IClientPackageResponseDTO>;
  restoreSessions(id: string, count: number): Promise<IClientPackageResponseDTO>;
  cancel(id: string): Promise<IClientPackageResponseDTO>;
  getSalesSummary(
    barbershopId: string,
    from?: Date,
    to?: Date
  ): Promise<IPackageSalesSummary>;
}
