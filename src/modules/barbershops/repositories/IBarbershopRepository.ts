import { ICreateBarbershopDTO } from "../dtos/ICreateBarbershopDTO";
import { IUpdateBarbershopDTO } from "../dtos/IUpdateBarbershopDTO";
import { IBarbershopResponseDTO } from "../dtos/IBarbershopResponseDTO";

export interface IBarbershopRepository {
  create(data: ICreateBarbershopDTO): Promise<IBarbershopResponseDTO>;
  findById(id: string): Promise<IBarbershopResponseDTO | null>;
  list(): Promise<IBarbershopResponseDTO[]>;
  update(id: string, data: IUpdateBarbershopDTO): Promise<IBarbershopResponseDTO>;
  deactivate(id: string): Promise<void>;
  getSchedule(barbershopId: string): Promise<Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>>;
  updateSchedule(barbershopId: string, schedule: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }>): Promise<void>;
}
