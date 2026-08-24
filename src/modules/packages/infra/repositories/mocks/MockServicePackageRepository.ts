import { IServicePackageRepository } from "@/modules/packages/repositories/IServicePackageRepository";
import {
  ICreateServicePackageDTO,
  IUpdateServicePackageDTO,
  IServicePackageResponseDTO,
} from "@/modules/packages/dtos/IPackageDTO";

export class MockServicePackageRepository implements IServicePackageRepository {
  public packages: IServicePackageResponseDTO[] = [];
  private seq = 1;

  async create(data: ICreateServicePackageDTO): Promise<IServicePackageResponseDTO> {
    const now = new Date();
    const entity: IServicePackageResponseDTO = {
      id: `svc-pkg-${this.seq++}`,
      barbershopId: data.barbershopId,
      serviceId: data.serviceId,
      serviceName: "Corte",
      servicePrice: 45,
      name: data.name,
      sessionCount: data.sessionCount,
      price: data.price,
      validityDays: data.validityDays ?? null,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.packages.push(entity);
    return entity;
  }

  async findById(id: string): Promise<IServicePackageResponseDTO | null> {
    return this.packages.find((p) => p.id === id) ?? null;
  }

  async list(
    barbershopId: string,
    activeOnly?: boolean
  ): Promise<IServicePackageResponseDTO[]> {
    return this.packages.filter(
      (p) =>
        p.barbershopId === barbershopId && (!activeOnly || p.active)
    );
  }

  async update(
    id: string,
    data: IUpdateServicePackageDTO
  ): Promise<IServicePackageResponseDTO> {
    const idx = this.packages.findIndex((p) => p.id === id);
    if (idx < 0) throw new Error("Pacote não encontrado");
    this.packages[idx] = {
      ...this.packages[idx],
      ...data,
      validityDays:
        data.validityDays !== undefined
          ? data.validityDays
          : this.packages[idx].validityDays,
      updatedAt: new Date(),
    };
    return this.packages[idx];
  }
}
