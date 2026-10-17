import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider, ISignedUploadUrlResult } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { ALLOWED_LOGO_MIME_TYPES } from "@/shared/config/upload";
import { LOGO_IMAGE_SPEC, imageSpecFolder } from "@/shared/constants/imageSpecs";

export interface IGetLogoUploadUrlDTO {
  barbershopId: string;
  mimeType: string;
}

export interface IGetLogoUploadUrlResult extends ISignedUploadUrlResult {
  barbershopId: string;
}

@injectable()
export class GetLogoUploadUrlUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
    @inject("ImageStorageProvider")
    private storageProvider: IStorageProvider
  ) {}

  async execute(
    data: IGetLogoUploadUrlDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IGetLogoUploadUrlResult> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    const extension = ALLOWED_LOGO_MIME_TYPES[data.mimeType];
    if (!extension) {
      throw new AppError(
        `Tipo de arquivo não permitido: ${data.mimeType}. Aceitos: JPEG, PNG, WebP`,
        400
      );
    }

    const barbershop = await this.barbershopRepository.findById(data.barbershopId);
    if (!barbershop) {
      throw new AppError("Salão não encontrado", 404);
    }

    // public_id determinístico: agendaja/{id}/logo/logo (sobrescreve a anterior)
    const result = await this.storageProvider.generateSignedUploadUrl(
      imageSpecFolder(data.barbershopId, LOGO_IMAGE_SPEC),
      `${LOGO_IMAGE_SPEC.cloudinaryPublicId}.${extension}`,
      data.mimeType,
      900
    );

    return { ...result, barbershopId: data.barbershopId };
  }
}
