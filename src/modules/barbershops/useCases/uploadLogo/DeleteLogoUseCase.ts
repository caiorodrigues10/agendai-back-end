import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";

@injectable()
export class DeleteLogoUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
    @inject("StorageProvider")
    private storageProvider: IStorageProvider
  ) { }

  async execute(
    barbershopId: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<void> {
    // Autorização: OWNER só pode alterar a própria barbearia
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError(
        "Acesso negado: você não pertence a esta barbearia",
        403
      );
    }

    const barbershop = await this.barbershopRepository.findById(barbershopId);
    if (!barbershop) {
      throw new AppError("Barbearia não encontrada", 404);
    }

    if (!barbershop.logoUrl) {
      throw new AppError("Esta barbearia não possui logo cadastrada", 404);
    }

    // Deleta o objeto do GCS
    const objectName = this.storageProvider.extractObjectName(barbershop.logoUrl);
    if (objectName) {
      await this.storageProvider.deleteObject(objectName);
    }

    // Limpa o campo no banco
    await this.barbershopRepository.update(barbershopId, { logoUrl: null });
  }
}