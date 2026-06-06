import { ICreatePlanDTO, IUpdatePlanDTO, IPlanResponseDTO } from "../dtos/IPlanDTO";

export interface IPlanRepository {
  create(data: ICreatePlanDTO): Promise<IPlanResponseDTO>;
  findById(id: string): Promise<IPlanResponseDTO | null>;
  list(onlyActive?: boolean): Promise<IPlanResponseDTO[]>;
  update(id: string, data: IUpdatePlanDTO): Promise<IPlanResponseDTO>;
  deactivate(id: string): Promise<void>;
}