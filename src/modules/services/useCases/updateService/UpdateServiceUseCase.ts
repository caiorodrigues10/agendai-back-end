import { IServiceCategoryRepository } from '../../../serviceCategories/repositories/ICategoryRepository';
import { AppError } from '@/shared/errors/AppError';
import { inject, injectable } from "tsyringe";
import { IServiceRepository } from "../../repositories/IServiceRepository";
import { IUpdateServiceDTO } from "../../dtos/IUpdateServiceDTO";
import { IServiceResponseDTO } from "../../dtos/IServiceResponseDTO";
import { assertShopAccess, type RequestingUser } from "../../../barbershops/utils/assertShopAccess";

@injectable()
export class UpdateServiceUseCase {
  constructor(
    @inject("ServiceRepository")
    private serviceRepository: IServiceRepository,
    @inject("ServiceCategoryRepository")
    private categoryRepository: IServiceCategoryRepository
  ) {}
  async execute(id: string, data: IUpdateServiceDTO, requestingUser: RequestingUser | undefined): Promise<IServiceResponseDTO> {
    const service = await this.serviceRepository.findById(id);
    if (!service) throw new AppError('Serviço não encontrado', 404);
    assertShopAccess(requestingUser, service.barbershopId);
    if (data.categoryId) {
      const category = await this.categoryRepository.findById(data.categoryId);
      if (!category || !category.active || (category.barbershopId !== null && category.barbershopId !== service.barbershopId)) {
        throw new AppError('Categoria indisponível para este salão', 400);
      }
    }
    return this.serviceRepository.update(id, data);
  }
}
