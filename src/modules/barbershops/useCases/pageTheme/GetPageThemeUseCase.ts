import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import {
  IBarbershopRepository,
  IPageThemeDTO,
} from "../../repositories/IBarbershopRepository";

@injectable()
export class GetPageThemeUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
  ) {}

  async execute(barbershopId: string): Promise<IPageThemeDTO | null> {
    return this.barbershopRepository.findPageTheme(barbershopId);
  }
}

export function assertOwnerShop(
  requestingUser: { role: string; barbershopId?: string },
  barbershopId: string,
): void {
  if (requestingUser.role !== "MASTER_ADMIN" && requestingUser.barbershopId !== barbershopId) {
    throw new AppError("Acesso negado: você não pertence a este salão", 403);
  }
}
