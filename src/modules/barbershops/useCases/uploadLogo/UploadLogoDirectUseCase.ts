import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";
import {
  ALLOWED_LOGO_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  validateMagicBytes,
} from "@/shared/config/upload";
import {
  LOGO_IMAGE_SPEC,
  imageSpecFolder,
  imageSpecPublicId,
} from "@/shared/constants/imageSpecs";
import { validateAndNormalizeImage } from "@/shared/utils/imageValidation";
import { deleteImageAsset } from "@/shared/utils/imageAssetDeletion";

export interface IUploadLogoDirectDTO {
  barbershopId: string;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}

@injectable()
export class UploadLogoDirectUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
    @inject("ImageStorageProvider")
    private storageProvider: IStorageProvider,
    @inject("StorageProvider")
    private legacyStorageProvider: IStorageProvider,
  ) {}

  async execute(
    data: IUploadLogoDirectDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IBarbershopResponseDTO> {
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

    if (data.buffer.byteLength > MAX_UPLOAD_SIZE_BYTES) {
      const sizeMb = (data.buffer.byteLength / 1024 / 1024).toFixed(2);
      throw new AppError(
        `Arquivo muito grande (${sizeMb} MB). Máximo permitido: 5 MB`,
        413
      );
    }

    if (!validateMagicBytes(data.buffer, data.mimeType)) {
      throw new AppError(
        `Arquivo corrompido ou tipo inválido: o conteúdo não corresponde a ${data.mimeType}`,
        400
      );
    }

    const barbershop = await this.barbershopRepository.findById(data.barbershopId);
    if (!barbershop) {
      throw new AppError("Salão não encontrado", 404);
    }

    const validated = await validateAndNormalizeImage({
      buffer: data.buffer,
      declaredMimeType: data.mimeType,
      spec: LOGO_IMAGE_SPEC,
    });

    const publicId = imageSpecPublicId(data.barbershopId, LOGO_IMAGE_SPEC);

    const uploaded = await this.storageProvider.uploadBuffer(
      imageSpecFolder(data.barbershopId, LOGO_IMAGE_SPEC),
      LOGO_IMAGE_SPEC.cloudinaryPublicId,
      validated.buffer,
      validated.mimeType,
      { overwrite: true, invalidate: true, publicId },
    );

    const previousObjectName =
      barbershop.logoPublicId ??
      this.legacyStorageProvider.extractObjectName(barbershop.logoUrl ?? "") ??
      null;
    if (previousObjectName && previousObjectName !== uploaded.objectName) {
      void deleteImageAsset({
        imageProvider: this.storageProvider,
        legacyProvider: this.legacyStorageProvider,
        publicId: barbershop.logoPublicId,
        publicUrl: barbershop.logoUrl,
        context: "UploadLogoDirect",
      });
    }

    return this.barbershopRepository.update(data.barbershopId, {
      logoUrl: uploaded.publicUrl,
      logoPublicId: uploaded.objectName,
    });
  }
}
