import { inject, injectable } from "tsyringe";
import { randomUUID } from "node:crypto";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { IBarbershopResponseDTO } from "../../dtos/IBarbershopResponseDTO";

/** Máximo de 5 MB por logo */
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg":  "jpg",
  "image/png":  "png",
  "image/webp": "webp",
};

const LOGO_FOLDER = "logos";

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
    @inject("StorageProvider")
    private storageProvider: IStorageProvider
  ) {}

  async execute(
    data: IUploadLogoDirectDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IBarbershopResponseDTO> {
    // Autorização: OWNER só pode alterar a própria barbearia
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    // Valida MIME type
    const extension = ALLOWED_MIME_TYPES[data.mimeType];
    if (!extension) {
      throw new AppError(
        `Tipo de arquivo não permitido: ${data.mimeType}. Aceitos: JPEG, PNG, WebP`,
        400
      );
    }

    // Valida tamanho
    if (data.buffer.byteLength > MAX_SIZE_BYTES) {
      const sizeMb = (data.buffer.byteLength / 1024 / 1024).toFixed(2);
      throw new AppError(
        `Arquivo muito grande (${sizeMb} MB). Máximo permitido: 5 MB`,
        413
      );
    }

    // Verifica se a barbearia existe
    const barbershop = await this.barbershopRepository.findById(data.barbershopId);
    if (!barbershop) {
      throw new AppError("Salão não encontrado", 404);
    }

    // Nome único para evitar colisões e invalidar cache automaticamente
    const fileName = `barbershop-${data.barbershopId}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;

    // Se já tinha logo, deleta do GCS (fire-and-forget)
    if (barbershop.logoUrl) {
      const oldObjectName = this.storageProvider.extractObjectName(barbershop.logoUrl);
      if (oldObjectName) {
        this.storageProvider
          .deleteObject(oldObjectName)
          .catch((err) =>
            console.warn(
              `[UploadLogoDirect] Falha ao deletar logo antiga (${oldObjectName}):`,
              err?.message
            )
          );
      }
    }

    // Upload do buffer para o GCS
    const uploaded = await this.storageProvider.uploadBuffer(
      LOGO_FOLDER,
      fileName,
      data.buffer,
      data.mimeType
    );

    // Salva a URL pública no banco
    return this.barbershopRepository.update(data.barbershopId, {
      logoUrl: uploaded.publicUrl,
    });
  }
}
