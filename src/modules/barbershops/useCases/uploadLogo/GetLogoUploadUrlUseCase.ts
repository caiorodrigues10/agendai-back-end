import { inject, injectable } from "tsyringe";
import { randomUUID } from "node:crypto";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider, ISignedUploadUrlResult } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg":  "jpg",
  "image/png":  "png",
  "image/webp": "webp",
};

const LOGO_FOLDER = "logos";

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
    @inject("StorageProvider")
    private storageProvider: IStorageProvider
  ) {}

  async execute(
    data: IGetLogoUploadUrlDTO,
    requestingUser: { role: string; barbershopId?: string }
  ): Promise<IGetLogoUploadUrlResult> {
    // Autorização: OWNER só pode alterar a própria barbearia
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      data.barbershopId !== requestingUser.barbershopId
    ) {
      throw new AppError("Acesso negado: você não pertence a este salão", 403);
    }

    const extension = ALLOWED_MIME_TYPES[data.mimeType];
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

    // Nome único: logos/barbershop-{uuid}-{timestamp}-{random}.{ext}
    const fileName = `barbershop-${data.barbershopId}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;

    const result = await this.storageProvider.generateSignedUploadUrl(
      LOGO_FOLDER,
      fileName,
      data.mimeType,
      900 // 15 minutos
    );

    return { ...result, barbershopId: data.barbershopId };
  }
}
