import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";

export interface IConfirmLogoDTO {
  barbershopId: string;
  /** URL pública retornada pelo GetLogoUploadUrlUseCase */
  logoUrl: string;
}

const LEGACY_LOGOS_PREFIX = "logos/";
const TENANT_LOGO_PREFIX = "agendaja/";

@injectable()
export class ConfirmLogoUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
    @inject("ImageStorageProvider")
    private storageProvider: IStorageProvider,
    @inject("StorageProvider")
    private legacyStorageProvider: IStorageProvider
  ) { }

  async execute(
    data: IConfirmLogoDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IBarbershopResponseDTO> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError(
        "Acesso negado: você não pertence a este salão",
        403
      );
    }

    const barbershop = await this.barbershopRepository.findById(
      data.barbershopId
    );
    if (!barbershop) {
      throw new AppError("Salão não encontrado", 404);
    }

    // Cloudinary (fluxo novo) ou GCS legado — valida que a URL é nossa
    const objectName =
      this.storageProvider.extractObjectName(data.logoUrl) ??
      this.legacyStorageProvider.extractObjectName(data.logoUrl);
    if (!objectName) {
      throw new AppError(
        "logoUrl inválida: a URL deve pertencer ao bucket de assets da plataforma",
        400
      );
    }

    const isTenantPath = objectName.startsWith(`${TENANT_LOGO_PREFIX}${data.barbershopId}/logo/`);
    const isLegacyPath = objectName.startsWith(LEGACY_LOGOS_PREFIX);
    if (!isTenantPath && !isLegacyPath) {
      throw new AppError(
        "logoUrl inválida: o arquivo deve estar na pasta de logos",
        400
      );
    }

    const previousObjectName =
      barbershop.logoPublicId ??
      this.legacyStorageProvider.extractObjectName(barbershop.logoUrl ?? "") ??
      null;
    if (previousObjectName && previousObjectName !== objectName) {
      this.legacyStorageProvider
        .deleteObject(previousObjectName)
        .catch((err) =>
          console.warn(
            `[ConfirmLogo] Falha ao deletar logo antiga (${previousObjectName}):`,
            err?.message
          )
        );
    }

    return this.barbershopRepository.update(data.barbershopId, {
      logoUrl: data.logoUrl,
      logoPublicId: objectName,
    });
  }
}
