import { inject, injectable } from "tsyringe";
import { randomUUID } from "node:crypto";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { IBarbershopRepository } from "@/modules/barbershops/repositories/IBarbershopRepository";
import {
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_SIZE_BYTES,
  validateVideoMagicBytes,
} from "@/shared/config/upload";

export interface IUploadVideoDTO {
  barbershopId: string;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}

export interface IUploadVideoResult {
  videoUrl: string;
}

@injectable()
export class UploadVideoUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
    @inject("StorageProvider")
    private storageProvider: IStorageProvider
  ) {}

  async execute(
    data: IUploadVideoDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IUploadVideoResult> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    const extension = ALLOWED_VIDEO_MIME_TYPES[data.mimeType];
    if (!extension) {
      throw new AppError(
        `Tipo de arquivo não permitido: ${data.mimeType}. Aceitos: MP4, WebM, MOV`,
        400
      );
    }

    if (data.buffer.byteLength > MAX_VIDEO_SIZE_BYTES) {
      const sizeMb = (data.buffer.byteLength / 1024 / 1024).toFixed(2);
      throw new AppError(
        `Arquivo muito grande (${sizeMb} MB). Máximo permitido: 25 MB`,
        413
      );
    }

    if (!validateVideoMagicBytes(data.buffer, data.mimeType)) {
      throw new AppError(
        `Arquivo corrompido ou tipo inválido: o conteúdo não corresponde a ${data.mimeType}`,
        400
      );
    }

    const barbershop = await this.barbershopRepository.findById(data.barbershopId);
    if (!barbershop) {
      throw new AppError("Salão não encontrado", 404);
    }

    const fileName = `video-${data.barbershopId}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;

    const uploaded = await this.storageProvider.uploadBuffer(
      "posts",
      fileName,
      data.buffer,
      data.mimeType
    );

    return { videoUrl: uploaded.publicUrl };
  }
}
