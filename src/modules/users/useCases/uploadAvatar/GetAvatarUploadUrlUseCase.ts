import { inject, injectable } from "tsyringe";
import { randomUUID } from "node:crypto";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider, ISignedUploadUrlResult } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { IUserRepository } from "../../repositories/IUserRepository";
import { ALLOWED_LOGO_MIME_TYPES } from "@/shared/config/upload";

const AVATAR_FOLDER = "avatars";

export interface IGetAvatarUploadUrlDTO {
  userId: string;
  mimeType: string;
}

@injectable()
export class GetAvatarUploadUrlUseCase {
  constructor(
    @inject("UserRepository")
    private userRepository: IUserRepository,
    @inject("StorageProvider")
    private storageProvider: IStorageProvider
  ) {}

  async execute(
    data: IGetAvatarUploadUrlDTO,
    requestingUser: { id: string; role: string; barbershopId?: string }
  ): Promise<ISignedUploadUrlResult> {
    // Authorization: owner/admin can change anyone, employee only themselves
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      requestingUser.role !== "OWNER" &&
      requestingUser.id !== data.userId
    ) {
      throw new AppError("Acesso negado: você só pode alterar sua própria foto", 403);
    }

    const extension = ALLOWED_LOGO_MIME_TYPES[data.mimeType];
    if (!extension) {
      throw new AppError(
        `Tipo de arquivo não permitido: ${data.mimeType}. Aceitos: JPEG, PNG, WebP`,
        400
      );
    }

    const user = await this.userRepository.findById(data.userId);
    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    const fileName = `user-${data.userId}-${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`;

    return this.storageProvider.generateSignedUploadUrl(
      AVATAR_FOLDER,
      fileName,
      data.mimeType,
      900 // 15 minutes
    );
  }
}
