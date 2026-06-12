import {
  ICreateServiceCategoryDTO,
  IUpdateServiceCategoryDTO,
  IServiceCategoryResponseDTO,
  ICreateExpenseCategoryDTO,
  IUpdateExpenseCategoryDTO,
  IExpenseCategoryResponseDTO,
} from "../../services/dtos/ICategoryDTO"

export interface IServiceCategoryRepository {
  create(data: ICreateServiceCategoryDTO): Promise<IServiceCategoryResponseDTO>;
  findById(id: string): Promise<IServiceCategoryResponseDTO | null>;
  list(barbershopId?: string, onlyActive?: boolean): Promise<IServiceCategoryResponseDTO[]>;
  update(id: string, data: IUpdateServiceCategoryDTO): Promise<IServiceCategoryResponseDTO>;
  delete(id: string): Promise<void>;
}

export interface IExpenseCategoryRepository {
  create(data: ICreateExpenseCategoryDTO): Promise<IExpenseCategoryResponseDTO>;
  findById(id: string): Promise<IExpenseCategoryResponseDTO | null>;
  list(barbershopId?: string, onlyActive?: boolean): Promise<IExpenseCategoryResponseDTO[]>;
  update(id: string, data: IUpdateExpenseCategoryDTO): Promise<IExpenseCategoryResponseDTO>;
  delete(id: string): Promise<void>;
}