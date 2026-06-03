import { inject, injectable } from "tsyringe";
import { IServiceRepository } from "../../repositories/IServiceRepository";

@injectable()
export class DeleteServiceUseCase {
  constructor(
    @inject("ServiceRepository")
    private serviceRepository: IServiceRepository
  ) {}
  async execute(id: string): Promise<void> {
    await this.serviceRepository.deactivate(id);
  }
}
