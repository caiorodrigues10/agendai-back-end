import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { IUserRepository } from "../../repositories/IUserRepository";

export interface IConfirmAvatarDTO {
  userId: string;
  avatarUrl: string;
}

@injectable()
export class ConfirmAvatarUseCase {
  constructor(
    @inject("UserRepository")
    private userRepository: IUserRepository,
    @inject("StorageProvider")
    private storageProvider: IStorageProvider
  ) {}

  async execute(
    data: IConfirmAvatarDTO,
    requestingUser: { id: string; role: string; barbershopId?: string }
  ): Promise<{ id: string; avatarUrl: string | null }> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      requestingUser.role !== "OWNER" &&
      requestingUser.id !== data.userId
    ) {
      throw new AppError("Acesso negado: você só pode alterar sua própria foto", 403);
    }

    const user = await this.userRepository.findById(data.userId);
    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    // Validate URL belongs to our bucket
    const objectName = this.storageProvider.extractObjectName(data.avatarUrl);
    if (!objectName) {
      throw new AppError(
        "avatarUrl inválida: a URL deve pertencer ao bucket de assets da plataforma",
        400
      );
    }

    if (!objectName.startsWith("avatars/")) {
      throw new AppError(
        "avatarUrl inválida: o arquivo deve estar na pasta de avatares",
        400
      );
    }

    // Delete old avatar fire-and-forget
    if (user.avatarUrl) {
      const oldObjectName = this.storageProvider.extractObjectName(user.avatarUrl);
      if (oldObjectName) {
        this.storageProvider.deleteObject(oldObjectName).catch((err) =>
          console.warn(`[ConfirmAvatar] Falha ao deletar avatar antigo (${oldObjectName}):`, err?.message)
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: data.userId },
      data: { avatarUrl: data.avatarUrl },
      select: { id: true, avatarUrl: true },
    });

    return updated;
  }
}
