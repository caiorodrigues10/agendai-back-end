import { ICreateServiceDTO } from "../dtos/ICreateServiceDTO";
import { IUpdateServiceDTO } from "../dtos/IUpdateServiceDTO";
import { IServiceResponseDTO } from "../dtos/IServiceResponseDTO";

export interface IServiceRepository {
  create(data: ICreateServiceDTO): Promise<IServiceResponseDTO>;
  findById(id: string, barbershopId?: string): Promise<IServiceResponseDTO | null>;
  list(barbershopId?: string): Promise<IServiceResponseDTO[]>;
  update(id: string, data: IUpdateServiceDTO): Promise<IServiceResponseDTO>;
  deactivate(id: string): Promise<void>;
}
