import { inject, injectable } from "tsyringe";
import { IServiceRepository } from "../../repositories/IServiceRepository";
import { IServiceResponseDTO } from "../../dtos/IServiceResponseDTO";
import { AppError } from "@/shared/errors/AppError";

@injectable()
export class GetServiceUseCase {
  constructor(
    @inject("ServiceRepository")
    private serviceRepository: IServiceRepository
  ) {}
  async execute(id: string, barbershopId?: string): Promise<IServiceResponseDTO> {
    const service = await this.serviceRepository.findById(id, barbershopId);
    if (!service) throw new AppError("Serviço não encontrado", 404);
    return service;
  }
}
