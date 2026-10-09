import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IServiceRepository } from "../../repositories/IServiceRepository";
import { assertShopAccess, type RequestingUser } from "../../../barbershops/utils/assertShopAccess";

@injectable()
export class DeleteServiceUseCase {
  constructor(
    @inject("ServiceRepository")
    private serviceRepository: IServiceRepository
  ) {}
  async execute(id: string, requestingUser: RequestingUser | undefined): Promise<void> {
    const service = await this.serviceRepository.findById(id);
    if (!service) throw new AppError('Serviço não encontrado', 404);
    assertShopAccess(requestingUser, service.barbershopId);
    await this.serviceRepository.deactivate(id);
  }
}
