import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";

@injectable()
export class DeleteLogoUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
    @inject("ImageStorageProvider")
    private storageProvider: IStorageProvider,
    @inject("StorageProvider")
    private legacyStorageProvider: IStorageProvider
  ) { }

  async execute(
    barbershopId: string,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<void> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError(
        "Acesso negado: você não pertence a este salão",
        403
      );
    }

    const barbershop = await this.barbershopRepository.findById(barbershopId);
    if (!barbershop) {
      throw new AppError("Salão não encontrado", 404);
    }

    if (!barbershop.logoUrl && !barbershop.logoPublicId) {
      throw new AppError("Este salão não possui logo cadastrada", 404);
    }

    const objectName =
      barbershop.logoPublicId ??
      this.storageProvider.extractObjectName(barbershop.logoUrl ?? "") ??
      this.legacyStorageProvider.extractObjectName(barbershop.logoUrl ?? "");
    if (objectName) {
      await this.legacyStorageProvider.deleteObject(objectName);
    }

    await this.barbershopRepository.update(barbershopId, {
      logoUrl: null,
      logoPublicId: null,
    });
  }
}
