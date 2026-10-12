import { IServiceCategoryRepository } from '../../../serviceCategories/repositories/ICategoryRepository';
import { AppError } from '@/shared/errors/AppError';
import { inject, injectable } from "tsyringe";
import { IServiceRepository } from "../../repositories/IServiceRepository";
import { ICreateServiceDTO } from "../../dtos/ICreateServiceDTO";
import { IServiceResponseDTO } from "../../dtos/IServiceResponseDTO";
import { assertShopAccess, type RequestingUser } from "../../../barbershops/utils/assertShopAccess";

@injectable()
export class CreateServiceUseCase {
  constructor(
    @inject("ServiceRepository")
    private serviceRepository: IServiceRepository,
    @inject("ServiceCategoryRepository")
    private categoryRepository: IServiceCategoryRepository
  ) {}
  async execute(data: ICreateServiceDTO, requestingUser: RequestingUser | undefined): Promise<IServiceResponseDTO> {
    assertShopAccess(requestingUser, data.barbershopId);
    if (data.categoryId) {
      const category = await this.categoryRepository.findById(data.categoryId);
      if (!category || !category.active || (category.barbershopId !== null && category.barbershopId !== data.barbershopId)) {
        throw new AppError('Categoria indisponível para este salão', 400);
      }
    }
    return this.serviceRepository.create(data);
  }
}
