import { inject, injectable } from "tsyringe";
import { IServiceRepository } from "../../repositories/IServiceRepository";
import { IUpdateServiceDTO } from "../../dtos/IUpdateServiceDTO";
import { IServiceResponseDTO } from "../../dtos/IServiceResponseDTO";

@injectable()
export class UpdateServiceUseCase {
  constructor(
    @inject("ServiceRepository")
    private serviceRepository: IServiceRepository
  ) {}
  async execute(id: string, data: IUpdateServiceDTO): Promise<IServiceResponseDTO> {
    return this.serviceRepository.update(id, data);
  }
}
