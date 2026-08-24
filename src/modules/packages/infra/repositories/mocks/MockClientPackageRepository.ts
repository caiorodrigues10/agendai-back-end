import { AppError } from "@/shared/errors/AppError";
import {
  IClientPackageRepository,
  ICreateClientPackageRecord,
} from "@/modules/packages/repositories/IClientPackageRepository";
import {
  IClientPackageResponseDTO,
  IPackageSalesSummary,
  ClientPackageStatus,
} from "@/modules/packages/dtos/IPackageDTO";

export class MockClientPackageRepository implements IClientPackageRepository {
  public packages: IClientPackageResponseDTO[] = [];
  private seq = 1;

  seedClientMeta: Record<
    string,
    { name: string; whatsapp: string; serviceDurationMinutes?: number }
  > = {};

  async create(data: ICreateClientPackageRecord): Promise<IClientPackageResponseDTO> {
    const now = new Date();
    const meta = this.seedClientMeta[data.clientId];
    const entity: IClientPackageResponseDTO = {
      id: `client-pkg-${this.seq++}`,
      barbershopId: data.barbershopId,
      clientId: data.clientId,
      clientName: meta?.name ?? "Cliente",
      clientWhatsapp: meta?.whatsapp ?? "11999999999",
      packageId: data.packageId,
      packageName: "Pacote",
      serviceId: data.serviceId,
      serviceName: "Corte",
      serviceDurationMinutes: meta?.serviceDurationMinutes ?? 30,
      totalSessions: data.totalSessions,
      remainingSessions: data.remainingSessions,
      pricePaid: data.pricePaid,
      paymentMethod: data.paymentMethod,
      status: "ACTIVE",
      purchasedAt: now,
      expiresAt: data.expiresAt ?? null,
      soldById: data.soldById ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.packages.push(entity);
    return entity;
  }

  async findById(id: string): Promise<IClientPackageResponseDTO | null> {
    return this.packages.find((p) => p.id === id) ?? null;
  }

  async list(params: {
    barbershopId: string;
    clientId?: string;
    status?: ClientPackageStatus;
  }): Promise<IClientPackageResponseDTO[]> {
    return this.packages.filter(
      (p) =>
        p.barbershopId === params.barbershopId &&
        (!params.clientId || p.clientId === params.clientId) &&
        (!params.status || p.status === params.status)
    );
  }

  async debitSessions(id: string, count: number): Promise<IClientPackageResponseDTO> {
    const idx = this.packages.findIndex((p) => p.id === id);
    if (idx < 0) throw new AppError("Pacote do cliente não encontrado", 404);
    const pkg = this.packages[idx];
    const expired =
      pkg.status === "EXPIRED" ||
      (pkg.expiresAt != null && pkg.expiresAt.getTime() <= Date.now());
    if (expired) throw new AppError("Pacote expirado", 400);
    if (pkg.status !== "ACTIVE" || pkg.remainingSessions < count) {
      throw new AppError("Saldo insuficiente ou pacote indisponível", 400);
    }
    const remaining = pkg.remainingSessions - count;
    this.packages[idx] = {
      ...pkg,
      remainingSessions: remaining,
      status: remaining === 0 ? "DEPLETED" : "ACTIVE",
      updatedAt: new Date(),
    };
    return this.packages[idx];
  }

  async restoreSessions(id: string, count: number): Promise<IClientPackageResponseDTO> {
    const idx = this.packages.findIndex((p) => p.id === id);
    if (idx < 0) throw new AppError("Pacote do cliente não encontrado", 404);
    const pkg = this.packages[idx];
    if (pkg.status !== "ACTIVE" && pkg.status !== "DEPLETED") return pkg;
    const remaining = pkg.remainingSessions + count;
    this.packages[idx] = {
      ...pkg,
      remainingSessions: remaining,
      status: remaining > 0 ? "ACTIVE" : "DEPLETED",
      updatedAt: new Date(),
    };
    return this.packages[idx];
  }

  async cancel(id: string): Promise<IClientPackageResponseDTO> {
    const idx = this.packages.findIndex((p) => p.id === id);
    if (idx < 0) throw new AppError("Pacote do cliente não encontrado", 404);
    this.packages[idx] = {
      ...this.packages[idx],
      status: "CANCELLED",
      updatedAt: new Date(),
    };
    return this.packages[idx];
  }

  async getSalesSummary(
    barbershopId: string,
    from?: Date,
    to?: Date
  ): Promise<IPackageSalesSummary> {
    const rows = this.packages.filter((p) => {
      if (p.barbershopId !== barbershopId) return false;
      if (p.status !== "ACTIVE" && p.status !== "DEPLETED") return false;
      if (from && p.purchasedAt < from) return false;
      if (to && p.purchasedAt > to) return false;
      return true;
    });
    return {
      count: rows.length,
      totalPaid: rows.reduce((s, p) => s + p.pricePaid, 0),
    };
  }
}
