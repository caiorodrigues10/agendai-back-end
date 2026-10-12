import { inject, injectable } from "tsyringe";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";

export interface ListBarbershopsOptions {
  limit?: number;
  offset?: number;
}

@injectable()
export class ListBarbershopsUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository
  ) {}
  async execute(options: ListBarbershopsOptions = {}): Promise<IBarbershopResponseDTO[]> {
    const list = await this.barbershopRepository.list();
    const { limit, offset = 0 } = options;
    if (limit === undefined && offset === 0) return list;
    return list.slice(offset, limit === undefined ? undefined : offset + limit);
  }
}
