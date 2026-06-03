import { inject, injectable } from "tsyringe";
import { IServiceRepository } from "../../repositories/IServiceRepository";
import { IServiceResponseDTO } from "../../dtos/IServiceResponseDTO";

@injectable()
export class ListServicesUseCase {
  constructor(
    @inject("ServiceRepository")
    private serviceRepository: IServiceRepository
  ) {}
  async execute(barbershopId?: string): Promise<IServiceResponseDTO[]> {
    return this.serviceRepository.list(barbershopId);
  }
}
