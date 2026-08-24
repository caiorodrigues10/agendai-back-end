import {
  ICreateServicePackageDTO,
  IUpdateServicePackageDTO,
  IServicePackageResponseDTO,
} from "../dtos/IPackageDTO";

export interface IServicePackageRepository {
  create(data: ICreateServicePackageDTO): Promise<IServicePackageResponseDTO>;
  findById(id: string): Promise<IServicePackageResponseDTO | null>;
  list(
    barbershopId: string,
    activeOnly?: boolean
  ): Promise<IServicePackageResponseDTO[]>;
  update(
    id: string,
    data: IUpdateServicePackageDTO
  ): Promise<IServicePackageResponseDTO>;
}
