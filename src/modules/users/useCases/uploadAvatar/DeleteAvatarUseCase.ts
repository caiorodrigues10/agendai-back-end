import { inject, injectable } from "tsyringe";
import { prisma } from "@/libs/prismaClient";
import { AppError } from "@/shared/errors/AppError";
import { IStorageProvider } from "@/shared/container/providers/StorageProvider/IStorageProvider";
import { IUserRepository } from "../../repositories/IUserRepository";

@injectable()
export class DeleteAvatarUseCase {
  constructor(
    @inject("UserRepository")
    private userRepository: IUserRepository,
    @inject("StorageProvider")
    private storageProvider: IStorageProvider
  ) {}

  async execute(
    userId: string,
    requestingUser: { id: string; role: string; barbershopId?: string }
  ): Promise<void> {
    if (
      requestingUser.role !== "MASTER_ADMIN" &&
      requestingUser.role !== "OWNER" &&
      requestingUser.id !== userId
    ) {
      throw new AppError("Acesso negado: você só pode alterar sua própria foto", 403);
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    if (!user.avatarUrl) {
      throw new AppError("Este usuário não possui foto cadastrada", 404);
    }

    const objectName = this.storageProvider.extractObjectName(user.avatarUrl);
    if (objectName) {
      await this.storageProvider.deleteObject(objectName);
    }

    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
    });
  }
}
