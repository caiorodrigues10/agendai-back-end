import { inject, injectable } from "tsyringe";
import { IServiceRepository } from "../../repositories/IServiceRepository";
import { ICreateServiceDTO } from "../../dtos/ICreateServiceDTO";
import { IServiceResponseDTO } from "../../dtos/IServiceResponseDTO";

@injectable()
export class CreateServiceUseCase {
  constructor(
    @inject("ServiceRepository")
    private serviceRepository: IServiceRepository
  ) {}
  async execute(data: ICreateServiceDTO): Promise<IServiceResponseDTO> {
    return this.serviceRepository.create(data);
  }
}
